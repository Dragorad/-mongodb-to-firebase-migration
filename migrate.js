
import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';
import { db } from './src/firebaseInit.js';
import { collection, writeBatch, doc } from 'firebase/firestore';
import dotenv from 'dotenv';
import serviceAccount from './config/firebaseAppCredentials.json' with {type : 'json'} ;
dotenv.config();


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  const adminDb = admin.firestore();

async function migrateData() {


    const userName = encodeURIComponent(process.env.MONGODB_USERNAME);
    const password = encodeURIComponent(process.env.MONGODB_PASSWORD);
    const connectionString = `mongodb+srv://${userName}:${password}@cluster0.ep2da.gcp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
    try {
        // Свържете се с MongoDB
        const mongoClient = new MongoClient(connectionString);
        await mongoClient.connect();
        
        // Изберете базата данни и колекцията
        const mongoDb = mongoClient.db('Dragora_Selector');
        const titleRecordsCollection = mongoDb.collection('title_records');

        // Извлечете данните
        const titleRecords = await titleRecordsCollection.find({
            url: { $exists: true }
        }).limit(10).toArray();
        console.log(titleRecords[9]);

        // Създайте batch за записване във Firestore
        const batch = writeBatch(db);
        const titleRecordsRef = collection(db, 'title_records');

        titleRecords.forEach(record => {
            const transformedRecord = {
        ...record,
        _id: record._id.toString()
    };

    const docRef = doc(titleRecordsRef, transformedRecord._id);
    batch.set(docRef, transformedRecord);
        });

        // Изпълнете batch операцията
        await batch.commit();

        console.log(`Мигрирани ${titleRecords.length} документа`);

        // Затворете връзката с MongoDB
        await mongoClient.close();
    } catch (error) {
        console.error('Грешка при миграцията:', error);
    }
}

migrateData();