/**
 * Premiere DOM API ile timeline islemleri
 * SequenceEditor action pattern: action olustur -> transaction icerisinde calistir
 */

const timeUtils = require("../utils/time");

/**
 * Sequence'den tum track item'lari al
 * @param {object} sequence
 * @returns {Promise<{videoItems: object[], audioItems: object[]}>}
 */
async function getTrackItems(sequence) {
  const videoItems = [];
  const audioItems = [];

  // Video trackleri tara
  const videoTrackCount = await sequence.getVideoTrackCount();
  for (let i = 0; i < videoTrackCount; i++) {
    const track = await sequence.getVideoTrack(i);
    if (track) {
      const items = await track.getTrackItems(0, 0);
      if (items) {
        for (const item of items) {
          const startTime = await item.getStartTime();
          const endTime = await item.getEndTime();
          videoItems.push({
            item,
            trackIndex: i,
            start: timeUtils.ticksToSeconds(startTime.ticks),
            end: timeUtils.ticksToSeconds(endTime.ticks),
          });
        }
      }
    }
  }

  // Audio trackleri tara
  const audioTrackCount = await sequence.getAudioTrackCount();
  for (let i = 0; i < audioTrackCount; i++) {
    const track = await sequence.getAudioTrack(i);
    if (track) {
      const items = await track.getTrackItems(0, 0);
      if (items) {
        for (const item of items) {
          const startTime = await item.getStartTime();
          const endTime = await item.getEndTime();
          audioItems.push({
            item,
            trackIndex: i,
            start: timeUtils.ticksToSeconds(startTime.ticks),
            end: timeUtils.ticksToSeconds(endTime.ticks),
          });
        }
      }
    }
  }

  return { videoItems, audioItems };
}

/**
 * Sequence toplam suresini al (saniye)
 * @param {object} sequence
 * @returns {Promise<number>}
 */
async function getSequenceDuration(sequence) {
  const endTime = await sequence.getEndTime();
  return timeUtils.ticksToSeconds(endTime.ticks);
}

/**
 * Sequence adini al
 * @param {object} sequence
 * @returns {Promise<string>}
 */
async function getSequenceName(sequence) {
  return await sequence.getName();
}

module.exports = {
  getTrackItems,
  getSequenceDuration,
  getSequenceName,
};
