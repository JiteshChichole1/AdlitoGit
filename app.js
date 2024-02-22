const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Datastore = require('nedb');

const app = express();
const port = 80;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for file uploads
const upload = multer({ dest: path.join(__dirname, 'temp') });

// Initialize the database
const db = new Datastore({ filename: 'uploadedFiles.db', autoload: true });

// Route to get the list of files in the package folder
app.get('/files', (req, res) => {
  const packageFolder = path.join(__dirname, 'package');

  fs.readdir(packageFolder, (err, files) => {
    if (err) {
      console.error('Error reading package folder:', err);
      return res.status(500).send('Error reading package folder.');
    }

    const allowedExtensions = ['.zip', '.rar'];
    const filteredFiles = files.filter((file) =>
      allowedExtensions.includes(path.extname(file))
    );

    // Fetch the file data from the database
    db.find({}, (err, entries) => {
      if (err) {
        console.error('Error fetching database entries:', err);
        return res.status(500).send('Error fetching database entries.');
      }

      // Merge the file data from the file system and the database based on filename
      const fileData = filteredFiles.map((file) => {
        const filePath = path.join(packageFolder, file);
        const stats = fs.statSync(filePath);
        const entry = entries.find((entry) => entry.fileName === file);

        return {
          name: file,
          url: `/download/${encodeURIComponent(file)}`,
          fileSize: stats.size,
          uploadedDate: stats.mtime.toISOString(),
          developerName: entry ? entry.developerName : 'N/A', // Use "N/A" if developer name not found
          about: entry ? entry.about : 'N/A', // Use "N/A" if about not found
          fileID: entry ? entry.fileID : 'N/A', // Use "N/A" if fileID not found
        };
      });

      res.json(fileData);
    });
  });
});

// Route to download the files
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const file = path.join(__dirname, 'package', filename);
  res.download(file, (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      res.status(500).send('Error downloading file.');
    }
  });
});

// Route to handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
  const tempFilePath = req.file.path;
  const targetDir = path.join(__dirname, 'package');

  // Get the user-provided filename without the extension
  const userFilename = req.body.uploadfilename.trim();
  const originalExtension = path.extname(req.file.originalname);
  const newFilename = userFilename + originalExtension;
  const targetFilePath = path.join(targetDir, newFilename);

  fs.rename(tempFilePath, targetFilePath, (err) => {
    if (err) {
      console.error('Error moving uploaded file:', err);
      return res.status(500).send('Error moving uploaded file.');
    }

    const fileInfo = {
      fileID: Date.now().toString(),
      fileName: newFilename, // Save the new filename with original extension
      developerName: req.body.developername, // Save the developer name
      about: req.body.about, // Save the about content
      uploadedDate: new Date().toISOString(),
      fileSize: req.file.size,
    };

    // Save fileInfo to the database
    db.insert(fileInfo, (err, newFile) => {
      if (err) {
        console.error('Error saving file info to the database:', err);
        return res.status(500).send('Error saving file info to the database.');
      }

      res.redirect('/uploadfile.html');
    });
  });
});

// Route to get all entries from the database
app.get('/database', (req, res) => {
  db.find({}, (err, entries) => {
    if (err) {
      console.error('Error fetching database entries:', err);
      return res.status(500).send('Error fetching database entries.');
    }
    res.json(entries);
  });
});

// Route to remove a file and its database entry
app.delete('/remove/:fileID', (req, res) => {
  const fileID = req.params.fileID;
  const packageFolder = path.join(__dirname, 'package');

  db.findOne({ fileID }, (err, entry) => {
    if (err) {
      console.error('Error finding database entry:', err);
      return res.status(500).send('Error finding database entry.');
    }

    if (!entry) {
      console.error('Database entry not found.');
      return res.status(404).send('Database entry not found.');
    }

    const filename = entry.fileName;
    const filePath = path.join(packageFolder, filename);

    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error removing file:', err);
        return res.status(500).send('Error removing file.');
      }

      db.remove({ fileID }, {}, (err, numRemoved) => {
        if (err) {
          console.error('Error removing database entry:', err);
          return res.status(500).send('Error removing database entry.');
        }

        res.sendStatus(200);
      });
    });
  });
});

// Route to get file information by file name
app.get('/fileinfo/:filename', (req, res) => {
  const filename = req.params.filename;

  // Search for the file information in the database by the given filename
  db.findOne({ fileName: filename }, (err, fileInfo) => {
    if (err) {
      console.error('Error fetching file information:', err);
      return res.status(500).json({ error: 'Error fetching file information.' });
    }

    if (!fileInfo) {
      return res.json({ error: 'File not found.' });
    }

    // Add the file URL to the fileInfo object
    fileInfo.url = `/download/${encodeURIComponent(fileInfo.fileName)}`;

    res.json(fileInfo);
  });
});



// Route to handle 404 errors
app.use((req, res, next) => {
  res.status(404).send("Sorry, can't find that!");
});

// Route to handle internal server errors
app.use((err, req, res, next) => {
  console.error('Internal Server Error:', err);
  res.status(500).send('Internal Server Error');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});