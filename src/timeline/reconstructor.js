/**
 * Keep-only reconstruction (Codex/Adobe pattern: source in/out on PI, append at dst cursor)
 *
 * Akis:
 *  1) Tum orijinal track item'lari ripple-delete ile sil (sequence bosalir).
 *  2) dst = TickTime(0) cursor ile her keep segment icin:
 *       - clipProjectItem.createSetInOutPointsAction(srcIn=seg.start, srcOut=seg.end)
 *       - editor.createInsertProjectItemAction(pi, dst, videoIdx, audioIdx, true)
 *       - dst = dst.add(srcOut.subtract(srcIn))  (TickTime aritmetik)
 *  3) Sonunda clipProjectItem.createClearInOutPointsAction() ile temizle.
 *  4) Sonuc: klipler timeline 0'dan baslayarak yan yana dizilir.
 */

const seqEditor = require("./sequence-editor");

async function reconstruct(inputSequence, _removeSegments, onProgress, keepSegments) {
  const ppro = require("premierepro");

  if (!keepSegments || keepSegments.length === 0) {
    return { success: false, message: "Tutulacak bolge yok — ayarlar cok agresif (sessizlik esigi duser, min. sessizlik artir)" };
  }

  let project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Aktif proje yok");

  let sequence = inputSequence;
  let editor = ppro.SequenceEditor.getEditor(sequence);
  if (!editor) throw new Error("SequenceEditor alinamadi");

  const { videoItems, audioItems } = await seqEditor.getTrackItems(sequence);
  const allItems = [...videoItems, ...audioItems];
  if (allItems.length === 0) {
    return { success: false, message: "Sequence bos" };
  }

  const rootProjectItem = await findPrimaryProjectItem(videoItems, audioItems);
  if (!rootProjectItem) {
    return { success: false, message: "ProjectItem bulunamadi" };
  }
  const rootMediaPath = await getProjectItemMediaPath(ppro, rootProjectItem);

  const { videoTrackIdx, audioTrackIdx } = pickTargetTracks(videoItems, audioItems);
  const mediaTypeAny = getMediaType(ppro, "ANY", 0);

  let stage = "baslangic";

  try {
    // ——— Phase 1: Orijinal klipleri sil ———
    stage = "orijinalleri silme";
    runActionTransaction(project, "PremierSEYO: Remove originals", () => {
      const action = createRemoveActionForItems(ppro, editor, allItems, true, mediaTypeAny, true);
      if (!action) throw new Error("createRemoveItemsAction null");
      return action;
    });

    await new Promise(r => setTimeout(r, 250));
    ({ project, sequence, editor } = await refreshSequenceContext(ppro, sequence));

    // ——— Phase 2: Keep segmentleri Codex pattern'iyle dizme ———
    // Her segment icin:
    //   a) clipPI.createSetInOutPointsAction(srcIn, srcOut) commit
    //   b) editor.createInsertProjectItemAction(pi, dst, V, A, limitShift=true) commit
    //   c) dst = dst.add(srcOut.subtract(srcIn))
    let dst = ppro.TickTime.createWithSeconds(0);
    let successCount = 0;
    let resolvedProjectItem = rootProjectItem;
    let clipPI = await safeCastClipProjectItem(ppro, resolvedProjectItem);
    if (!clipPI) {
      throw new Error("ClipProjectItem.cast basarisiz");
    }

    for (let i = 0; i < keepSegments.length; i++) {
      const seg = keepSegments[i];
      const segmentNumber = i + 1;
      const srcIn = ppro.TickTime.createWithSeconds(seg.start);
      const srcOut = ppro.TickTime.createWithSeconds(seg.end);

      stage = `seg ${segmentNumber} source in/out`;
      runActionTransaction(project, `PremierSEYO: Source in/out seg ${segmentNumber}`, () => {
        const action = clipPI.createSetInOutPointsAction(srcIn, srcOut);
        if (!action) throw new Error("createSetInOutPointsAction null");
        return action;
      });

      stage = `seg ${segmentNumber} insert`;
      resolvedProjectItem = await resolveProjectItem(ppro, project, resolvedProjectItem, rootMediaPath);
      clipPI = await safeCastClipProjectItem(ppro, resolvedProjectItem);
      const dstAtInsert = dst;
      runActionTransaction(project, `PremierSEYO: Insert seg ${segmentNumber}`, () => {
        const action = editor.createInsertProjectItemAction(
          resolvedProjectItem,
          dstAtInsert,
          videoTrackIdx,
          audioTrackIdx,
          true
        );
        if (!action) throw new Error(`insert action null (seg ${segmentNumber})`);
        return action;
      });

      await new Promise(r => setTimeout(r, 180));
      ({ project, sequence, editor } = await refreshSequenceContext(ppro, sequence));

      // dst cursor'i TickTime aritmetigi ile ilerlet
      dst = tickAdd(ppro, dst, tickSub(ppro, srcOut, srcIn));

      successCount++;
      if (onProgress) {
        onProgress(Math.round((successCount / keepSegments.length) * 95));
      }
    }

    // Kalan in/out'u bin item'dan temizle (ProjectPanel'deki source view'i bozmamak icin)
    stage = "clear source in/out";
    try {
      runActionTransaction(project, "PremierSEYO: Clear source in/out", () => {
        if (typeof clipPI.createClearInOutPointsAction !== "function") return null;
        return clipPI.createClearInOutPointsAction();
      });
    } catch (e) {
      console.warn("clear in/out uyarisi:", e.message);
    }

    if (onProgress) onProgress(100);

    return {
      success: true,
      message: `${successCount}/${keepSegments.length} segment kesildi`,
    };
  } catch (e) {
    console.error("Reconstruction hatasi:", e);
    throw new Error(`Kesim uygulanamadi (${stage}): ` + (e.message || String(e)));
  }
}

async function safeCastClipProjectItem(ppro, projectItem) {
  if (!projectItem) return null;
  try {
    const clipPI = await ppro.ClipProjectItem.cast(projectItem);
    if (clipPI) return clipPI;
  } catch {}
  return null;
}

function tickAdd(ppro, a, b) {
  if (a && typeof a.add === "function") {
    try { return a.add(b); } catch {}
  }
  const secs = toSeconds(a) + toSeconds(b);
  return ppro.TickTime.createWithSeconds(secs);
}

function tickSub(ppro, a, b) {
  if (a && typeof a.subtract === "function") {
    try { return a.subtract(b); } catch {}
  }
  const secs = toSeconds(a) - toSeconds(b);
  return ppro.TickTime.createWithSeconds(secs);
}

function toSeconds(tickTime) {
  if (!tickTime) return 0;
  if (typeof tickTime.seconds === "number") return tickTime.seconds;
  try { return Number(tickTime.seconds || 0); } catch { return 0; }
}

function pickTargetTracks(videoItems, audioItems) {
  // Kullanicinin orijinal medyasinin bulundugu en dusuk track index'ini hedefle.
  const videoTrackIdx = videoItems.length > 0
    ? Math.min(...videoItems.map(i => i.trackIndex))
    : 0;
  const audioTrackIdx = audioItems.length > 0
    ? Math.min(...audioItems.map(i => i.trackIndex))
    : 0;
  return { videoTrackIdx, audioTrackIdx };
}

async function findPrimaryProjectItem(videoItems, audioItems) {
  const candidates = [...videoItems, ...audioItems];
  for (const ti of candidates) {
    try {
      const projectItem = await ti.item.getProjectItem();
      if (projectItem) return projectItem;
    } catch {}
  }
  return null;
}

async function findItemsStartingNear(sequence, startSeconds) {
  const { videoItems, audioItems } = await seqEditor.getTrackItems(sequence);
  return [...videoItems, ...audioItems].filter(item => (
    Math.abs(item.start - startSeconds) < 0.25
  ));
}

async function findLatestInsertedItems(sequence) {
  // Yeni eklenen clipler timeline sonundadir. Her track icin en buyuk start'a sahip item.
  // Video+Audio birlikte arandigi icin max'a yakin tum item'lari dondur.
  const { videoItems, audioItems } = await seqEditor.getTrackItems(sequence);
  const all = [...videoItems, ...audioItems];
  if (all.length === 0) return [];
  const maxStart = Math.max(...all.map(i => i.start));
  return all.filter(i => Math.abs(i.start - maxStart) < 0.25);
}

function createTrimActions(ppro, items, sourceStart, sourceEnd) {
  const trimActions = [];
  const inTT = ppro.TickTime.createWithSeconds(sourceStart);
  const outTT = ppro.TickTime.createWithSeconds(sourceEnd);

  for (const item of items) {
    const inAction = item.item.createSetInPointAction(inTT);
    const outAction = item.item.createSetOutPointAction(outTT);
    if (inAction) trimActions.push(inAction);
    if (outAction) trimActions.push(outAction);
  }

  return trimActions;
}

function getMediaType(ppro, name, fallback) {
  const mediaType = (ppro.Constants || ppro.constants || {}).MediaType || {};
  const variants = [name, name.toLowerCase(), name[0] + name.slice(1).toLowerCase()];
  for (const variant of variants) {
    if (mediaType[variant] !== undefined) return mediaType[variant];
  }
  return fallback;
}

function createRemoveActionForItems(ppro, editor, items, ripple, mediaType, shiftOverLapping) {
  const factory = ppro.TrackItemSelection;
  if (!factory || typeof factory.createEmptySelection !== "function") {
    throw new Error("TrackItemSelection API bulunamadi");
  }

  let action = null;
  let callbackError = null;

  try {
    factory.createEmptySelection((selection) => {
      try {
        addItemsToSelection(selection, items);
        action = createRemoveItemsAction(editor, selection, ripple, mediaType, shiftOverLapping);
      } catch (e) {
        callbackError = e;
      }
    });
  } catch (e) {
    callbackError = e;
  }

  if (callbackError && !action) {
    console.warn("TrackItemSelection callback yolu basarisiz:", callbackError.message || callbackError);
  }
  if (action) return action;

  // Eski hostlarda createEmptySelection dogrudan selection dondurebiliyor.
  let selection = null;
  try {
    const result = factory.createEmptySelection();
    if (result && typeof result.addItem === "function") selection = result;
  } catch (e) {
    throw new Error("Track item selection olusturulamadi: " + (e.message || String(e)));
  }

  if (!selection) {
    throw new Error("Track item selection olusturulamadi");
  }

  addItemsToSelection(selection, items);
  return createRemoveItemsAction(editor, selection, ripple, mediaType, shiftOverLapping);
}

function addItemsToSelection(selection, items) {
  if (!selection || typeof selection.addItem !== "function") {
    throw new Error("Track item selection gecersiz");
  }

  for (const ti of items) {
    const ok = selection.addItem(ti.item, true);
    if (ok === false) {
      console.warn("Selection addItem basarisiz:", ti.start, ti.end);
    }
  }
}

function createRemoveItemsAction(editor, selection, ripple, mediaType, shiftOverLapping) {
  try {
    return editor.createRemoveItemsAction(selection, ripple, mediaType, shiftOverLapping);
  } catch (e) {
    if (!/parameter/i.test(e.message || "")) throw e;
    return editor.createRemoveItemsAction(selection, ripple, mediaType);
  }
}

async function refreshSequenceContext(ppro, previousSequence) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Aktif proje yok");

  let sequence = await project.getActiveSequence();
  if (!sequence && previousSequence) sequence = previousSequence;
  if (!sequence) throw new Error("Aktif sequence yok");

  const editor = ppro.SequenceEditor.getEditor(sequence);
  if (!editor) throw new Error("SequenceEditor alinamadi");

  return { project, sequence, editor };
}

async function getProjectItemMediaPath(ppro, projectItem) {
  try {
    const clipItem = await ppro.ClipProjectItem.cast(projectItem);
    if (!clipItem) return "";
    return await clipItem.getMediaFilePath();
  } catch {
    return "";
  }
}

async function resolveProjectItem(ppro, project, cachedProjectItem, mediaPath) {
  if (cachedProjectItem) {
    try {
      if (!mediaPath) return cachedProjectItem;
      const cachedPath = await getProjectItemMediaPath(ppro, cachedProjectItem);
      if (cachedPath === mediaPath) return cachedProjectItem;
    } catch {}
  }

  if (!mediaPath) return cachedProjectItem;

  try {
    const rootItem = await project.getRootItem();
    const found = await findProjectItemByMediaPath(ppro, rootItem, mediaPath, new Set());
    return found || cachedProjectItem;
  } catch {
    return cachedProjectItem;
  }
}

async function findProjectItemByMediaPath(ppro, projectItem, mediaPath, seen) {
  if (!projectItem) return null;

  let key = "";
  try { key = String(projectItem.guid || projectItem.name || ""); } catch {}
  if (key && seen.has(key)) return null;
  if (key) seen.add(key);

  try {
    const clipItem = await ppro.ClipProjectItem.cast(projectItem);
    if (clipItem) {
      const path = await clipItem.getMediaFilePath();
      if (path === mediaPath) return projectItem;
    }
  } catch {}

  try {
    const folderItem = await ppro.FolderItem.cast(projectItem);
    if (folderItem && typeof folderItem.getItems === "function") {
      const children = await folderItem.getItems();
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = await findProjectItemByMediaPath(ppro, child, mediaPath, seen);
          if (found) return found;
        }
      }
    }
  } catch {}

  return null;
}

function runActionTransaction(project, label, actionFactory) {
  let ok = true;
  let callbackError = null;

  try {
    project.lockedAccess(() => {
      ok = project.executeTransaction((ca) => {
        try {
          const actions = normalizeActions(actionFactory());
          for (const action of actions) ca.addAction(action);
        } catch (e) {
          callbackError = e;
        }
      }, label);
    });
  } catch (e) {
    throw new Error(`${label} fail: ${(e.message || String(e)).substring(0, 160)}`);
  }

  if (callbackError) {
    throw new Error(`${label} action fail: ${(callbackError.message || String(callbackError)).substring(0, 160)}`);
  }
  if (ok === false) throw new Error(`${label} transaction basarisiz`);
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) actions = [actions];
  const filtered = actions.filter(Boolean);
  if (filtered.length === 0) throw new Error("Transaction action listesi bos");
  return filtered;
}

module.exports = { reconstruct };
