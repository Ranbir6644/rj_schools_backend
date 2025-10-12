// import axios from 'axios';
// import fs from 'fs';
// import path from 'path';
// import { uploadFromBuffer } from "../utils/uploadToCloudinary.js";
// import Student from "../models/Student.js";

// /**
//  * Migrate image from MySQL to Cloudinary
//  * Supports: Base64 strings, URLs, and local file paths
//  */
// export const migrateMySQLImageToCloudinary = async (imageSource, folder, studentId, imageField) => {
//     try {
//         console.log(`🔄 Processing ${imageField}...`);

//         let buffer;

//         // Case 1: Base64 string (most common in MySQL)
//         if (imageSource.startsWith('data:')) {
//             console.log(`📄 Processing base64 image for ${imageField}`);
//             const base64Data = imageSource.split(',')[1];
//             if (!base64Data) {
//                 throw new Error('Invalid base64 format');
//             }
//             buffer = Buffer.from(base64Data, 'base64');
//         }
//         // Case 2: HTTP/HTTPS URL
//         else if (imageSource.startsWith('http')) {
//             console.log(`🌐 Downloading from URL: ${imageSource}`);
//             const response = await axios({
//                 method: 'GET',
//                 url: imageSource,
//                 responseType: 'arraybuffer',
//                 timeout: 30000
//             });
//             buffer = Buffer.from(response.data);
//         }
//         // Case 3: Local file path
//         else {
//             console.log(`📁 Checking local file: ${imageSource}`);

//             // Try different possible paths
//             const possiblePaths = [
//                 imageSource,
//                 path.join(process.cwd(), 'public', imageSource),
//                 path.join(process.cwd(), 'uploads', imageSource),
//                 path.join(process.cwd(), imageSource),
//                 path.join(__dirname, '..', 'public', imageSource),
//                 path.join(__dirname, '..', 'uploads', imageSource)
//             ];

//             let foundPath = null;
//             for (const filePath of possiblePaths) {
//                 if (fs.existsSync(filePath)) {
//                     foundPath = filePath;
//                     break;
//                 }
//             }

//             if (foundPath) {
//                 console.log(`📁 Found file at: ${foundPath}`);
//                 buffer = fs.readFileSync(foundPath);
//             } else {
//                 throw new Error(`Image file not found: ${imageSource}`);
//             }
//         }

//         // Validate buffer
//         if (!buffer || buffer.length === 0) {
//             throw new Error('Empty image buffer');
//         }

//         // Check file size (5MB limit)
//         if (buffer.length > 5 * 1024 * 1024) {
//             throw new Error(`Image too large: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`);
//         }

//         // Upload to Cloudinary using your existing function
//         console.log(`☁️ Uploading ${imageField} to Cloudinary folder: ${folder}`);
//         const uploadResult = await uploadFromBuffer(buffer, folder);

//         // Update student record with Cloudinary URLs
//         const updateData = {
//             [imageField]: uploadResult.secure_url,
//             [`${imageField}PublicId`]: uploadResult.public_id
//         };

//         await Student.findByIdAndUpdate(studentId, updateData);

//         console.log(`✅ Successfully migrated ${imageField} to Cloudinary`);
//         return {
//             success: true,
//             url: uploadResult.secure_url,
//             publicId: uploadResult.public_id,
//             size: buffer.length
//         };

//     } catch (error) {
//         console.error(`❌ Failed to migrate ${imageField}:`, error.message);
//         return {
//             success: false,
//             error: error.message,
//             field: imageField
//         };
//     }
// };