/**
 * Sequence duplicate islemleri
 * Orijinal sequence'e dokunmadan guvenli bir kopya olusturur
 */

/**
 * Active sequence'i duplicate et
 * @param {string} [suffix=" - AutoCut"] — yeni sequence'in adi eki
 * @returns {Promise<object>} — yeni sequence nesnesi
 */
async function duplicateActiveSequence(suffix = " - AutoCut") {
  const ppro = require("premierepro");

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Aktif proje bulunamadi");

  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Aktif sequence bulunamadi");

  const seqName = await sequence.getName();
  const newName = seqName + suffix;

  // Sequence'i clone et
  const newSequence = await sequence.clone(newName);
  if (!newSequence) {
    throw new Error("Sequence kopyalanamadi");
  }

  // Yeni sequence'i aktif yap
  await project.openSequence(newSequence);

  return newSequence;
}

module.exports = { duplicateActiveSequence };
