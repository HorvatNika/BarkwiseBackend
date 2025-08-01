// works
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb+srv://nikahorvat1311:ijz2a4iz5NnqNInJ@cluster0.xvkk6wi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'yourAppDB'; // 🔁 name your DB however you like

const client = new MongoClient(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
  }
}

function getDB() {
  if (!db) throw new Error('❌ DB not connected yet');
  return db;
}

module.exports = { connectDB, getDB };
