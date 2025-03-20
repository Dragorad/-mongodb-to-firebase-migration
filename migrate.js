import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import admin from 'firebase-admin';
import { db } from './src/firebaseInit.js';
import { collection, writeBatch, doc, getDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
import serviceAccount from './config/firebaseAppCredentials.json' with {type : 'json'} ;
dotenv.config();


const args = process.argv.slice(2);
const skipIndex = args.indexOf('--skip');
const skipCount = skipIndex !== -1 && args[skipIndex + 1] ? parseInt(args[skipIndex + 1]) : 0;


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  const adminDb = admin.firestore();

async function migrateData(skipCount = 0) {
    let mongoClient;
    
    const userName = encodeURIComponent(process.env.MONGODB_USERNAME);
    const password = encodeURIComponent(process.env.MONGODB_PASSWORD);
    const connectionString = `mongodb+srv://${userName}:${password}@cluster0.ep2da.gcp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
    
    try {
        mongoClient = new MongoClient(connectionString);
        await mongoClient.connect();
        console.log('Connected to MongoDB');
        
        const mongoDb = mongoClient.db('Dragora_Selector');
        const titleRecordsCollection = mongoDb.collection('title_records');

        // Get total count for progress tracking
        const totalDocuments = await titleRecordsCollection.countDocuments({
            url: { $exists: true }
        });

        console.log('Total documents to migrate:', totalDocuments);

        const titleRecords = await titleRecordsCollection.find({
            url: { $exists: true }
        })
        .skip(skipCount)
        .limit(10)
        .toArray();
        
        if (titleRecords.length === 0) {
            console.log('No more documents to migrate');
            return {
                migratedCount: 0,
                hasMore: false,
                totalDocuments
            };
        }
        
        console.log(`Found ${titleRecords.length} documents in MongoDB (skipped ${skipCount})`);
        console.log('Last document in batch:', titleRecords[titleRecords.length - 1]);

        const batch = writeBatch(db);
        const titleRecordsRef = collection(db, 'title_records');
        const documentIds = [];
        
        titleRecords.forEach(record => {
            // Deep clone and transform the record to handle nested ObjectIds
            const transformedRecord = JSON.parse(JSON.stringify(record, (key, value) => {
                // Convert any ObjectId to string
                if (value && value._bsontype === "ObjectId") {
                    return value.toString();
                }
                return value;
            }));
        
            const newId = record._id.toString();
            transformedRecord._id = newId;
            transformedRecord.migratedAt = new Date();
        
            documentIds.push(transformedRecord._id);
            const docRef = doc(titleRecordsRef, transformedRecord._id);
            batch.set(docRef, transformedRecord);
        });
        
        // titleRecords.forEach(record => {
        //     const newId = record._id.toString();
        //     const transformedRecord = {
        //         ...record,
        //         _id: newId,
        //         migratedAt: new Date()
        //     };

        //     documentIds.push(transformedRecord._id);
        //     const docRef = doc(titleRecordsRef, transformedRecord._id);
        //     batch.set(docRef, transformedRecord);
        // });

        await batch.commit();
        console.log(`Successfully started writting of ${titleRecords.length} documents to Firestore`);

        // Check if there are more documents to process
        const hasMore = (skipCount + titleRecords.length) < totalDocuments;
        console.log('Has more documents:', hasMore);

        return {
            migratedCount: titleRecords.length,
            hasMore,
            totalDocuments
        };

    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    } finally {
        if (mongoClient) {
            await mongoClient.close();
            console.log('MongoDB connection closed');
        }
    }
}

async function continuousMigration(startFrom = 0) {
    let totalMigrated = startFrom;
    let batchCount = 0;
    let hasMoreDocuments = true;
    let totalDocuments = 0;

    while (hasMoreDocuments) {
        try {
            console.log(`Starting batch ${batchCount + 1}, documents ${totalMigrated} to ${totalMigrated + 10}`);
            
            const result = await migrateData(totalMigrated);
            totalDocuments = result.totalDocuments;
            hasMoreDocuments = result.hasMore; // Update the loop condition

            if (result.migratedCount === 0) {
                hasMoreDocuments = false;
                break;
            }

            totalMigrated += result.migratedCount;
            batchCount++;

            console.log(`Progress: ${totalMigrated}/${totalDocuments} documents (${Math.round(totalMigrated/totalDocuments * 100)}%)`);
            
            // Optional: Add delay between batches
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`Error in batch ${batchCount + 1}:`, error);
            console.log(`Migration stopped at document ${totalMigrated}`);
            console.log('To resume, run:');
            console.log(`continuousMigration(${totalMigrated})`);
            return;
        }
    }

    console.log('Migration completed!');
    console.log(`Total documents migrated: ${totalMigrated}`);
    console.log(`Total batches processed: ${batchCount}`);
}

// Start the migration
continuousMigration();

async function main() {
    try {
        await continuousMigration(skipCount);
        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run main only if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
// # Resume from specific point (e.g., from document 20)
// npm run migrate:continue 20

// # Alternative syntax
// npm run migrate:from 20