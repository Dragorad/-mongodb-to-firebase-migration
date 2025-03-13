import {https} from "firebase-functions";
import {db} from "./firebaseInit.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

export const queryTitleRecords = https.onRequest(async (req, res) => {
  try {
    const queryObj = req.body;
    const {bpm, delta, averageLoudness, spectralCentroid, genresArr} = queryObj;

    const deltaMod = delta * 0.1;
    const titleRecords = collection(db, "title_records");

    const bpmMin = bpm - bpm * deltaMod;
    const bpmMax = bpm + bpm * deltaMod;
    const loudnessMin = 0.0644 + averageLoudness / 100 - deltaMod;
    const loudnessMax = 0.0644 + averageLoudness / 100 + deltaMod;

    const spectralNum = 200 + spectralCentroid * 21;
    const spectralMin = spectralNum - delta * 21;
    const spectralMax = spectralNum + delta * 21;

    const q = query(
        titleRecords,
        where("genres", "array-contains-any", genresArr),
        where("bpm", ">=", bpmMin),
        where("bpm", "<=", bpmMax),
        where("lowLevelSpectral.averageLoudness", ">=", loudnessMin),
        where("lowLevelSpectral.averageLoudness", "<=", loudnessMax),
        where("lowLevelSpectral.spectralCentroid.mean", ">=", spectralMin),
        where("lowLevelSpectral.spectralCentroid.mean", "<=", spectralMax),
        where("url", "!=", null),
        orderBy("chords_key"),
        orderBy("bpm"),
        limit(10),
    );

    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((doc) => doc.data());
    res.json(results);
  } catch (error) {
    console.error("Error querying title records:", error);
    res.status(500).send("Internal Server Error");
  }
});
