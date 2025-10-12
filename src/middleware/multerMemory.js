import multer from 'multer';

const storage = multer.memoryStorage();

// Custom file filter to allow images and documents
const fileFilter = (req, file, cb) => {
  // Check if it's an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } 
  // Check if it's a document (PDF, Word, etc.)
  else if (
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'application/msword' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    cb(null, true);
  } 
  else {
    cb(new Error('Only images and documents (PDF, Word) are allowed'), false);
  }
};

export const uploadMemory = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

