import { https } from 'firebase-functions';
import { db } from '../src/firebaseInit.js'; // Импортиране на Firestore
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

export const queryTitleRecords = https.onRequest(async (req, res) => {
  try {
    const queryObj = req.body;
    const { bpm, delta, average_loudness, spectral_centroid, genresArr } = queryObj;

    const deltaMod = delta * 0.1;
    const titleRecords = collection(db, 'title_records');

    let bpmMin = bpm - bpm * deltaMod;
    let bpmMax = bpm + bpm * deltaMod;
    let loudnessMin = 0.0644 + average_loudness / 100 - deltaMod;
    let loudnessMax = 0.0644 + average_loudness / 100 + deltaMod;

    let spectralNum = 200 + spectral_centroid * 21;
    let spectralMin = spectralNum - delta * 21;
    let spectralMax = spectralNum + delta * 21;

    const q = query(
      titleRecords,
      where('genres', 'array-contains-any', genresArr),
      where('bpm', '>=', bpmMin),
      where('bpm', '<=', bpmMax),
      where('lowLevelSpectral.average_loudness', '>=', loudnessMin),
      where('lowLevelSpectral.average_loudness', '<=', loudnessMax),
      where('lowLevelSpectral.spectral_centroid.mean', '>=', spectralMin),
      where('lowLevelSpectral.spectral_centroid.mean', '<=', spectralMax),
      where('url', '!=', null),
      orderBy('chords_key'),
      orderBy('bpm'),
      limit(10)
    );

    const snapshot = await getDocs(q);
    const results = snapshot.docs.map(doc => doc.data());
    res.json(results);
  } catch (error) {
    console.error('Error querying title records:', error);
    res.status(500).send('Internal Server Error');
  }
});