import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid/Expired token" });

    req.user = user; 
    console.log("Authenticated user:", user);
    next();
  });
};
