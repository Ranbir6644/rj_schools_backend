import User from "../models/User.js";

// Get all users
export const getUsers = async (req, res) => {
  const users = await User.find().select("-refreshToken");
  res.json(users);
};

// Get user by id
export const getUser = async (req, res) => {
  const user = await User.findById(req.params.id).select("-refreshToken");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
};

// Update user
export const updateUser = async (req, res) => {
  const { name, udise, ePunjabId, role } = req.body;

  let updateData = { name, udise, ePunjabId, role };

  const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
  res.json(user);
};

// Delete user
export const deleteUser = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
};
