import Class from "../models/Class.js";

// Create Class
export const createClass = async (req, res) => {
  try {
    // Create the class instance but don't save yet
    const newClass = new Class({
      name: req.body.name,
      section: req.body.section,
      incharge: req.body.incharge || null
    });

    // Save the class
    await newClass.save();
    
    // Populate the incharge field in the response
    await newClass.populate('incharge');
    
    res.status(201).json({ message: "Class created", class: newClass });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Get All Classes
export const getClasses = async (req, res) => {
  try {
    const classes = await Class.find().populate({
      path: 'incharge'
    });
    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Class by ID
export const getClassById = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id).populate({
      path: 'incharge',
    });
    if (!cls) return res.status(404).json({ message: "Class not found" });
    res.json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update Class
export const updateClass = async (req, res) => {
  try {
    // Prepare update data
    const updateData = {
      ...(req.body.name && { name: req.body.name }),
      ...(req.body.section && { section: req.body.section }),
      ...(req.body.hasOwnProperty('incharge') && { incharge: req.body.incharge })
    };

    const updatedClass = await Class.findByIdAndUpdate(
      req.params.id, 
      updateData,
      { new: true }
    ).populate('incharge');
    
    if (!updatedClass) return res.status(404).json({ message: "Class not found" });
    
    res.json({ message: "Class updated", class: updatedClass });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Delete Class
export const deleteClass = async (req, res) => {
  try {
    const deleted = await Class.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Class not found" });
    res.json({ message: "Class deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


