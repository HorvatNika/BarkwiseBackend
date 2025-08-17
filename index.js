const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { connectDB, getDB } = require('./db');
const { ObjectId } = require('mongodb'); 

connectDB();

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your_super_secret_key';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));


const nodemailer = require('nodemailer');

let transporter;

async function setupMailer() {
  const testAccount = await nodemailer.createTestAccount();

  transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });

  console.log(' Ethereal email account created');
  console.log(' Login:', testAccount.user);
  console.log(' Pass:', testAccount.pass);
}



// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Register
app.post('/register', upload.single('profilePicture'), async (req, res) => {
  const { name, birthday, colorPattern, email, password, confirmPassword } = req.body;

  if (!name || !email || !password || !confirmPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  const db = getDB();
  const usersCollection = db.collection('users');

  const existingUser = await usersCollection.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const profilePicture = req.file ? req.file.filename : null; 

  const newUser = {
    name,
    birthday,
    colorPattern,
    email,
    password: hashedPassword,
    profilePicture, 
  };

  const result = await usersCollection.insertOne(newUser);
  console.log(" File received:", req.file);
  res.status(201).json({
    message: 'Registration successful!',
    user: {
      id: result.insertedId,
      email,
      name,
      profilePicture: profilePicture ? `/uploads/${profilePicture}` : null
    },
  });
});


// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const db = getDB();
  const user = await db.collection('users').findOne({ email });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  const tokenPayload = { id: user._id, email: user.email, name: user.name, role: 'user' };
  const token = jwt.sign(tokenPayload, SECRET_KEY, { expiresIn: '4h' });

  res.status(200).json({ message: 'Login successful!', user: { id: user._id, email: user.email, name: user.name, token } });
});



function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded; 
    next();
  });
}

// NEW: helper (place near verifyToken)
function getUserIdFromReq(req) {
  return typeof req.user.id === 'string' ? new ObjectId(req.user.id) : req.user.id;
}


// Journal entries
// CREATE journal entry
// CREATE journal entry  (modified)
app.post('/journal', verifyToken, async (req, res) => {
  const { title, description, image } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required' });

  const timestamp = new Date().toLocaleString('hr-HR');
  const db = getDB();

  const result = await db.collection('journalLogs').insertOne({
    userId: getUserIdFromReq(req),       // <— added
    title,
    description: description || '',
    image: image || '',
    timestamp
  });

  res.status(201).json({
    message: 'Journal entry created',
    entry: {
      id: result.insertedId,
      title,
      description: description || '',
      image: image || '',
      timestamp
    }
  });
});


// READ all journal entries
// READ all journal entries (modified)
app.get('/journal', verifyToken, async (req, res) => {
  const userId = getUserIdFromReq(req);
  const entries = await getDB()
    .collection('journalLogs')
    .find({ userId })            // <— filter by current user
    .toArray();
  res.json(entries);
});


// UPDATE an entry
// UPDATE an entry (modified)
app.put('/journal/:id', verifyToken, async (req, res) => {
  const { ObjectId } = require('mongodb');
  const { title, description, image } = req.body;

  const update = {};
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (image !== undefined) update.image = image;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  const result = await getDB().collection('journalLogs').findOneAndUpdate(
    { _id: new ObjectId(req.params.id), userId: getUserIdFromReq(req) }, // <— scoped
    { $set: update },
    { returnDocument: 'after' }
  );

  if (!result.value) return res.status(404).json({ message: 'Entry not found' });

  res.json({ message: 'Entry updated', entry: result.value });
});


// DELETE an entry
// DELETE an entry (modified)
app.delete('/journal/:id', verifyToken, async (req, res) => {
  const { ObjectId } = require('mongodb');
  const result = await getDB().collection('journalLogs').deleteOne({
    _id: new ObjectId(req.params.id),
    userId: getUserIdFromReq(req)     // <— scoped
  });
  if (result.deletedCount === 0) return res.status(404).json({ message: 'Entry not found' });
  res.json({ message: 'Entry deleted' });
});



// Dog profile
app.get('/dogprofile', async (req, res) => {
  const profile = await getDB().collection('dogProfile').findOne();
  res.status(200).json({ message: 'Dog profile route reached', dogProfile: profile });
});

app.post('/dogprofile', async (req, res) => {
  const { name, breed, age, health, trainingLevel } = req.body;
  if (!name || !breed || !age || !health || !trainingLevel) return res.status(400).json({ message: 'All fields required' });

  const db = getDB();
  await db.collection('dogProfile').deleteMany({});
  await db.collection('dogProfile').insertOne({ name, breed, age, health, trainingLevel });

  res.status(200).json({ message: 'Dog profile created successfully', dogProfile: { name, breed, age, health, trainingLevel } });
});


app.get('/profile', verifyToken, async (req, res) => {
  const db = getDB();


  const userId = typeof req.user.id === 'string' ? new ObjectId(req.user.id) : req.user.id;
  const user = await db.collection('users').findOne({ _id: userId });

  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({
  name: user.name,
  birthday: user.birthday,
  colorPattern: user.colorPattern,
  email: user.email,
  profilePicture: user.profilePicture ? `/uploads/${user.profilePicture}` : null
});

});


// Training progress
app.get('/progress', async (req, res) => {
  const milestones = await getDB().collection('trainingProgress').find().toArray();
  res.status(200).json({ message: 'Training progress data', milestones });
});

app.post('/progress', async (req, res) => {
  const { skill, status } = req.body;
  if (!skill || !status) return res.status(400).json({ message: 'Skill and status required' });

  const result = await getDB().collection('trainingProgress').insertOne({ skill, status });
  res.status(201).json({ message: 'Milestone added successfully', milestone: { id: result.insertedId, skill, status } });
});

// Schedule
// GET all schedule events for current user
app.get('/schedule', verifyToken, async (req, res) => {
  const userId = getUserIdFromReq(req);
  const events = await getDB()
    .collection('scheduleEvents')
    .find({ userId })
    .toArray();

  res.status(200).json(events);
});

// CREATE schedule event
app.post('/schedule', verifyToken, async (req, res) => {
  const { title, content, start, end } = req.body;
  if (!title || !start || !end) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const userId = getUserIdFromReq(req);
  const result = await getDB().collection('scheduleEvents').insertOne({
    userId,
    title,
    content,
    start,
    end
  });

  res.status(201).json({
    message: 'Event added successfully',
    event: { id: result.insertedId, title, content, start, end }
  });
});

// DELETE schedule event
app.delete('/schedule/:id', verifyToken, async (req, res) => {
  const { ObjectId } = require('mongodb');
  const userId = getUserIdFromReq(req);

  const result = await getDB().collection('scheduleEvents').deleteOne({
    _id: new ObjectId(req.params.id),
    userId
  });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: 'Event not found' });
  }

  res.json({ message: 'Event deleted' });
});

// UPDATE schedule event
app.put('/schedule/:id', verifyToken, async (req, res) => {
  const { ObjectId } = require('mongodb');
  const { title, content, start, end } = req.body;
  const userId = getUserIdFromReq(req);

  const result = await getDB().collection('scheduleEvents').findOneAndUpdate(
    { _id: new ObjectId(req.params.id), userId },
    { $set: { title, content, start, end } },
    { returnDocument: 'after' }
  );

  if (!result.value) {
    return res.status(404).json({ message: 'Event not found' });
  }

  res.json({ message: 'Event updated', event: result.value });
});


app.get('/comments', async (req, res) => {
  const { componentId } = req.query;
  const filter = componentId ? { componentId } : {};
  const comments = await getDB().collection('comments').find(filter).toArray();
  res.json(comments);
});

app.get('/comments/:id', async (req, res) => {
  const { ObjectId } = require('mongodb');
  const comment = await getDB().collection('comments').findOne({ _id: new ObjectId(req.params.id) });
  if (!comment) return res.status(404).json({ message: 'Comment not found' });
  res.json(comment);
});

app.post('/comments', verifyToken, async (req, res) => {
  const { text, componentId } = req.body;
  const author = req.user?.name || req.user?.email || 'Anonymous';

  if (!text || !componentId)
    return res.status(400).json({ message: 'Text and componentId are required' });

  const result = await getDB().collection('comments').insertOne({
    author,
    text,
    componentId,
    createdAt: new Date().toISOString()
  });

 res.status(201).json({
  message: 'Comment added',
  comment: { _id: result.insertedId, author, text, componentId }
});

});

app.put('/comments/:id', verifyToken, async (req, res) => {
  const { ObjectId } = require('mongodb');
  const { text } = req.body;
  const user = req.user;

  if (!text) return res.status(400).json({ message: 'Text is required' });

  try {
    const _id = new ObjectId(req.params.id);
    const existing = await getDB().collection('comments').findOne({ _id });

    if (!existing) return res.status(404).json({ message: 'Comment not found' });

    if (existing.author !== user.name && existing.author !== user.email) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await getDB().collection('comments').updateOne({ _id }, { $set: { text } });

    const updated = await getDB().collection('comments').findOne({ _id }); 

    res.json({
      message: 'Comment updated',
      comment: updated
    });
  } catch (err) {
    console.error(" PUT /comments/:id error:", err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

app.delete('/comments/:id', verifyToken, async (req, res) => {
  const { ObjectId } = require('mongodb');
  const user = req.user;

  const comment = await getDB().collection('comments').findOne({ _id: new ObjectId(req.params.id) });
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  if (comment.author !== user.name && comment.author !== user.email) {
    return res.status(403).json({ message: 'Unauthorized to delete this comment' });
  }

  await getDB().collection('comments').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ message: 'Comment deleted' });
});


// Mongo test route
app.get('/test-mongo', async (req, res) => {
  const result = await getDB().collection('testCollection').insertOne({ msg: 'Mongo is working!' });
  res.json({ message: 'Inserted into MongoDB', id: result.insertedId });
});

const crypto = require('crypto');

app.post('/forgot-password', async (req, res) => {
  console.log(' forgot-password endpoint hit');
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  const db = getDB();
  const user = await db.collection('users').findOne({ email });
  if (!user) return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.collection('passwordResets').insertOne({ userId: user._id, token, expiresAt });

  const resetLink = `http://localhost:8080/reset-password?token=${token}`;

  const mailOptions = {
    from: '"Barkwise Collie 🐾" <no-reply@barkwise.com>',
    to: email,
    subject: 'Reset Your Password',
    html: `
      <h3>Hello ${user.name || ''},</h3>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <a href="${resetLink}" target="_blank">${resetLink}</a>
      <p><i>This link will expire in 15 minutes.</i></p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(` Preview Email URL: ${previewUrl}`);

    res.status(200).json({ message: 'If that email exists, a reset link has been sent.', previewUrl });
  } catch (error) {
    console.error(' Email send failed:', error);
    res.status(500).json({ message: 'Failed to send email' });
  }
});



app.post('/reset-password', async (req, res) => {
  console.log(' reset-password endpoint hit');
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Invalid data' });
    }

    const db = getDB();
    const resetEntry = await db.collection('passwordResets').findOne({ token });
    if (!resetEntry || resetEntry.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Token expired or invalid' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.collection('users').updateOne(
      { _id: new ObjectId(resetEntry.userId) },
      { $set: { password: hashedPassword } }
    );

    await db.collection('passwordResets').deleteOne({ token });

    res.status(200).json({ message: 'Password successfully reset' });
  } catch (error) {
    console.error(' reset-password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// GET all weight entries
app.get('/dog-weight-history', async (req, res) => {
  const db = getDB();
  const weights = await db.collection('dogWeights')
    .find()
    .sort({ date: 1 }) 
    .toArray();
  res.json({ weights });
});

// POST a new weight entry
app.post('/dog-weight-history', async (req, res) => {
  const { date, weight } = req.body;

  if (!date || !weight) {
    return res.status(400).json({ message: 'Missing date or weight' });
  }

  const db = getDB();
  const existing = await db.collection('dogWeights').findOne({ date });
  if (existing) {
    return res.status(409).json({ message: 'Entry for this date already exists' });
  }

  await db.collection('dogWeights').insertOne({ date, weight: +weight });
  res.status(201).json({ message: 'Weight entry added' });
});



setupMailer().then(() => {
  app.listen(3000, () => {
    console.log(' Server running at http://localhost:3000');
  });
});
