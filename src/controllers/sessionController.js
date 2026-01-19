import mongoose from "mongoose";
import ArchivedAttendance from '../models/ArchivedAttendance.js';
import ArchivedClass from '../models/ArchivedClass.js';
import ArchivedFine from '../models/ArchivedFine.js';
import ArchivedStudent from '../models/ArchivedStudent.js';
import ArchivedTeacher from '../models/ArchivedTeacher.js';
import Attendance from '../models/Attendance.js';
import Class from '../models/Class.js';
import Fine from '../models/Fine.js';
import Session from '../models/Session.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import User from '../models/User.js';

export const archiveSession = async (req, res) => {
  const { sessionName, startDate, endDate } = req.body;

  if (!sessionName || !startDate) {
    return res.status(400).json({ message: 'Session name and start date are required.' });
  }

  const session = new Session({ name: sessionName, startDate, endDate });
  const sessionId = session._id;

  const sessionArchive = async () => {
    await session.save();

    // Archive Classes
    const classes = await Class.find().populate('incharge');
    const archivedClasses = classes.map(cls => {
      const clsObj = cls.toObject();
      const { _id, section, name, incharge, ...rest } = clsObj;
      const inchargeName = incharge?.name || null;
      return {
        name: name || 'Unknown Class',
        section: section || 'Unknown Section',
        incharge: inchargeName,
        ...rest,
        sessionId
      };
    });
    await ArchivedClass.insertMany(archivedClasses);

    // Archive Students
    const students = await Student.find().populate('userId');
    const archivedStudents = students.map(student => {
      const studentObj = student.toObject();
      
      const { _id, userId, ...rest } = studentObj;
      const studentName = userId?.name || 'Unknown Name';
      return {
        name: studentName,
        rollNumber: 'N/A', // rollNumber not available in current schema
        ...rest,
        sessionId
      };
    });
    await ArchivedStudent.insertMany(archivedStudents);

    // Archive Teachers
    const teachers = await Teacher.find().populate('userId');
    const archivedTeachers = teachers.map(teacher => {
      const teacherObj = teacher.toObject();
      const { _id, userId, ...rest } = teacherObj;
      const teacherName = userId?.name || 'Unknown Name';
      return {
        name: teacherName,
        udise: userId?.udise || 'N/A',
        ePunjabId: userId?.ePunjabId || 'N/A',
        employeeId: 'N/A', // employeeId not available in current schema
        ...rest,
        sessionId
      };
    });
    await ArchivedTeacher.insertMany(archivedTeachers);

    // Archive Attendance
    const attendance = await Attendance.find();
    const archivedAttendance = attendance.map(record => {
      const { _id, ...rest } = record.toObject();
      return {
        ...rest,
        sessionId
      };
    });
    await ArchivedAttendance.insertMany(archivedAttendance);

    // Archive Fines
    const fines = await Fine.find();
    const archivedFines = fines.map(fine => {
      const { _id, ...rest } = fine.toObject();
      return {
        ...rest,
        sessionId
      };
    });
    await ArchivedFine.insertMany(archivedFines);

    // Clear Main Tables
    await Attendance.deleteMany();
    await Fine.deleteMany();
    await Class.updateMany({}, { $set: { students: [], teachers: [] } });
  };

  const mgSession = await mongoose.startSession();
  mgSession.startTransaction();
  try {
    await sessionArchive();
    await mgSession.commitTransaction();
    res.status(200).json({ message: 'Session archived successfully.' });
  } catch (error) {
    await mgSession.abortTransaction();
    res.status(500).json({ message: 'Error archiving session.', error });
  } finally {
    mgSession.endSession();
  }
};