import Holiday from "../models/Holiday.js";

// ✅ Create a new holiday



// ✅ Create a new holiday - ENHANCED DUPLICATE CHECK
export const createHoliday = async (req, res) => {
  try {
    const { title, description, date } = req.body;

    if (!title || !date) {
      return res.status(400).json({ message: "Title and date are required" });
    }

    const holidayDate = new Date(date);
    const startOfDay = new Date(holidayDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(holidayDate);
    endOfDay.setHours(23, 59, 59, 999);

    // ENHANCED: Check if holiday already exists for this date (entire day)
    const existing = await Holiday.findOne({
      date: {
        $gte: startOfDay,
        $lt: endOfDay
      }
    });

    if (existing) {
      return res.status(400).json({
        message: `Holiday already exists for this date: ${existing.title}`,
        existingHoliday: existing
      });
    }

    const holiday = await Holiday.create({
      title,
      description,
      date: holidayDate,
      createdBy: req.user.id,
    });

    res.status(201).json({ message: "Holiday created successfully", holiday });
  } catch (err) {
    res.status(500).json({ message: "Error creating holiday", error: err.message });
  }
};

// ✅ Get all holidays
export const getAllHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json({ holidays });
  } catch (err) {
    res.status(500).json({ message: "Error fetching holidays", error: err.message });
  }
};

// ✅ Get a holiday by ID
export const getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ message: "Holiday not found" });
    res.json({ holiday });
  } catch (err) {
    res.status(500).json({ message: "Error fetching holiday", error: err.message });
  }
};

// ✅ Update a holiday
export const updateHoliday = async (req, res) => {
  try {
    const { title, description, date } = req.body;
    const holiday = await Holiday.findById(req.params.id);

    if (!holiday) return res.status(404).json({ message: "Holiday not found" });

    if (title) holiday.title = title;
    if (description !== undefined) holiday.description = description;
    if (date) holiday.date = new Date(date);

    const updated = await holiday.save();
    res.json({ message: "Holiday updated successfully", holiday: updated });
  } catch (err) {
    res.status(500).json({ message: "Error updating holiday", error: err.message });
  }
};

// ✅ Delete a holiday
export const deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ message: "Holiday not found" });
    res.json({ message: "Holiday deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting holiday", error: err.message });
  }
};



// ✅ Get holidays by year
export const getHolidaysByYear = async (req, res) => {
  try {
    const { year } = req.query;

    if (!year || isNaN(year)) {
      return res.status(400).json({ message: "Valid year is required" });
    }

    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`);

    const holidays = await Holiday.find({
      date: { $gte: startDate, $lt: endDate },
    }).sort({ date: 1 });

    res.json({ holidays });
  } catch (err) {
    res.status(500).json({ message: "Error fetching yearly holidays", error: err.message });
  }
};

// ✅ Get holidays by month and year
// export const getHolidaysByMonth = async (req, res) => {
//   try {
//     const { month, year } = req.query;

//     if (
//       !month ||
//       !year ||
//       isNaN(month) ||
//       isNaN(year) ||
//       month < 1 ||
//       month > 12
//     ) {
//       return res.status(400).json({ message: "Valid month and year are required" });
//     }

//     const startDate = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`);
//     const endDate = new Date(`${year}-${String(Number(month) + 1).padStart(2, "0")}-01T00:00:00.000Z`);

//     const holidays = await Holiday.find({
//       date: { $gte: startDate, $lt: endDate },
//     }).sort({ date: 1 });

//     res.json({ holidays });
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching monthly holidays", error: err.message });
//   }
// };

// ✅ Get holidays by month and year - FIXED
export const getHolidaysByMonth = async (req, res) => {
  try {
    const { month, year } = req.query;

    if (
      !month ||
      !year ||
      isNaN(month) ||
      isNaN(year) ||
      month < 1 ||
      month > 12
    ) {
      return res.status(400).json({ message: "Valid month and year are required" });
    }

    // FIX: Handle December case properly
    let startDate, endDate;

    if (parseInt(month) === 12) {
      // For December, end date is January 1st of next year
      startDate = new Date(`${year}-12-01T00:00:00.000Z`);
      endDate = new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`);
    } else {
      // For other months
      startDate = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`);
      endDate = new Date(`${year}-${String(parseInt(month) + 1).padStart(2, "0")}-01T00:00:00.000Z`);
    }

    console.log(`Fetching holidays from ${startDate} to ${endDate}`); // Debug log

    const holidays = await Holiday.find({
      date: { $gte: startDate, $lt: endDate },
    }).sort({ date: 1 });

    res.json({ holidays });
  } catch (err) {
    console.error("Error in getHolidaysByMonth:", err);
    res.status(500).json({ message: "Error fetching monthly holidays", error: err.message });
  }
};

// ✅ Mark all Sundays as holidays for a specific month
// ✅ Mark all Sundays as holidays for a specific month - FIXED TIMEZONE ISSUE
export const markSundaysAsHolidays = async (req, res) => {
  try {
    const { month, year, title = "Sunday Holiday", description = "Weekly off" } = req.body;

    // Validate and parse input
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (!month || !year || isNaN(monthNum) || isNaN(yearNum)) {
      return res.status(400).json({
        message: "Valid month and year are required in request body"
      });
    }

    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        message: "Month must be between 1 and 12"
      });
    }

    if (yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({
        message: "Year must be between 2000 and 2100"
      });
    }

    // Get all Sundays for the given month and year with proper timezone handling
    const sundays = getSundaysInMonth(monthNum, yearNum);

    if (sundays.length === 0) {
      return res.status(200).json({
        message: "No Sundays found for the given month and year",
        summary: {
          totalSundays: 0,
          created: 0,
          alreadyExists: 0,
          errors: 0
        },
        details: {
          created: [],
          alreadyExists: [],
          errors: []
        }
      });
    }

    const results = {
      created: [],
      alreadyExists: [],
      errors: []
    };

    // Create holidays for each Sunday
    for (const sundayDate of sundays) {
      try {
        // Use UTC date to avoid timezone issues
        const utcDate = new Date(Date.UTC(
          sundayDate.getUTCFullYear(),
          sundayDate.getUTCMonth(),
          sundayDate.getUTCDate(),
          12, 0, 0, 0 // Set to noon UTC to avoid timezone shift
        ));

        const startOfDay = new Date(utcDate);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const endOfDay = new Date(utcDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // Check if holiday already exists for this date
        const existingHoliday = await Holiday.findOne({
          date: {
            $gte: startOfDay,
            $lt: endOfDay
          }
        });

        if (existingHoliday) {
          results.alreadyExists.push({
            date: utcDate.toISOString().split('T')[0],
            existingHoliday: {
              title: existingHoliday.title,
              id: existingHoliday._id
            },
            message: `Holiday '${existingHoliday.title}' already exists for this date`
          });
          continue;
        }

        // Create new holiday with UTC date
        const holiday = await Holiday.create({
          title,
          description,
          date: utcDate,
          createdBy: req.user.id,
        });

        results.created.push({
          date: holiday.date.toISOString().split('T')[0],
          holidayId: holiday._id,
          title: holiday.title
        });

      } catch (error) {
        results.errors.push({
          date: sundayDate.toISOString().split('T')[0],
          error: error.message
        });
      }
    }

    // Prepare response message
    let message = '';
    if (results.created.length > 0) {
      message += `Successfully created ${results.created.length} Sunday(s) as holidays. `;
    }
    if (results.alreadyExists.length > 0) {
      message += `${results.alreadyExists.length} Sunday(s) already marked as holidays. `;
    }
    if (results.errors.length > 0) {
      message += `Encountered ${results.errors.length} error(s). `;
    }

    if (results.created.length === 0 && results.alreadyExists.length > 0) {
      message = `All ${results.alreadyExists.length} Sundays are already marked as holidays. No new holidays were created.`;
    }
    
    res.status(200).json({
      message: message.trim(),
      summary: {
        totalSundays: sundays.length,
        created: results.created.length,
        alreadyExists: results.alreadyExists.length,
        errors: results.errors.length
      },
      details: results
    });

  } catch (err) {
    console.error("Error in markSundaysAsHolidays:", err);
    res.status(500).json({
      message: "Error marking Sundays as holidays",
      error: err.message
    });
  }
};

// Helper function to get all Sundays in a month - FIXED TIMEZONE ISSUE
function getSundaysInMonth(month, year) {
  const sundays = [];
  
  // Use UTC to avoid timezone issues
  const date = new Date(Date.UTC(year, month - 1, 1));
  
  // Find first Sunday of the month
  while (date.getUTCDay() !== 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  // If we went to next month, return empty array
  if (date.getUTCMonth() !== month - 1) {
    return [];
  }

  // Get all Sundays in the month using UTC
  while (date.getUTCMonth() === month - 1) {
    // Create a new date object for each Sunday to avoid reference issues
    const sunday = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12, 0, 0, 0 // Set to noon UTC for consistency
    ));
    sundays.push(sunday);
    date.setUTCDate(date.getUTCDate() + 7);
  }

  return sundays;
}

// export const markSundaysAsHolidays = async (req, res) => {
//   try {
//     const { month, year, title = "Sunday Holiday", description = "Weekly off" } = req.body;

//     // Validate and parse input - FIXED: Convert to numbers
//     const monthNum = parseInt(month);
//     const yearNum = parseInt(year);

//     if (!month || !year || isNaN(monthNum) || isNaN(yearNum)) {
//       return res.status(400).json({
//         message: "Valid month and year are required in request body"
//       });
//     }

//     if (monthNum < 1 || monthNum > 12) {
//       return res.status(400).json({
//         message: "Month must be between 1 and 12"
//       });
//     }

//     if (yearNum < 2000 || yearNum > 2100) {
//       return res.status(400).json({
//         message: "Year must be between 2000 and 2100"
//       });
//     }

//     // Get all Sundays for the given month and year
//     const sundays = getSundaysInMonth(monthNum, yearNum);

//     if (sundays.length === 0) {
//       return res.status(200).json({ // Changed to 200 since it's not really an error
//         message: "No Sundays found for the given month and year",
//         summary: {
//           totalSundays: 0,
//           created: 0,
//           alreadyExists: 0,
//           errors: 0
//         },
//         details: {
//           created: [],
//           alreadyExists: [],
//           errors: []
//         }
//       });
//     }

//     const results = {
//       created: [],
//       alreadyExists: [],
//       errors: []
//     };

//     // Create holidays for each Sunday
//     for (const sundayDate of sundays) {
//       try {
//         // Create new date objects to avoid mutation issues
//         const startOfDay = new Date(sundayDate);
//         startOfDay.setHours(0, 0, 0, 0);

//         const endOfDay = new Date(sundayDate);
//         endOfDay.setHours(23, 59, 59, 999);

//         // Check if holiday already exists for this date
//         const existingHoliday = await Holiday.findOne({
//           date: {
//             $gte: startOfDay,
//             $lt: endOfDay
//           }
//         });

//         if (existingHoliday) {
//           results.alreadyExists.push({
//             date: sundayDate.toISOString().split('T')[0],
//             existingHoliday: {
//               title: existingHoliday.title,
//               id: existingHoliday._id
//             },
//             message: `Holiday '${existingHoliday.title}' already exists for this date`
//           });
//           continue;
//         }

//         // Create new holiday
//         const holiday = await Holiday.create({
//           title,
//           description,
//           date: sundayDate,
//           createdBy: req.user.id,
//         });

//         results.created.push({
//           date: holiday.date.toISOString().split('T')[0],
//           holidayId: holiday._id,
//           title: holiday.title
//         });

//       } catch (error) {
//         results.errors.push({
//           date: sundayDate.toISOString().split('T')[0],
//           error: error.message
//         });
//       }
//     }

//     // Prepare response message
//     let message = '';
//     if (results.created.length > 0) {
//       message += `Successfully created ${results.created.length} Sunday(s) as holidays. `;
//     }
//     if (results.alreadyExists.length > 0) {
//       message += `${results.alreadyExists.length} Sunday(s) already marked as holidays. `;
//     }
//     if (results.errors.length > 0) {
//       message += `Encountered ${results.errors.length} error(s). `;
//     }

//     // If no action was taken (all already exist or errors)
//     if (results.created.length === 0 && results.alreadyExists.length > 0) {
//       message = `All ${results.alreadyExists.length} Sundays are already marked as holidays. No new holidays were created.`;
//     }
    
//     res.status(200).json({
//       message: message.trim(),
//       summary: {
//         totalSundays: sundays.length,
//         created: results.created.length,
//         alreadyExists: results.alreadyExists.length,
//         errors: results.errors.length
//       },
//       details: results
//     });

//   } catch (err) {
//     console.error("Error in markSundaysAsHolidays:", err);
//     res.status(500).json({
//       message: "Error marking Sundays as holidays",
//       error: err.message
//     });
//   }
// };

// // Helper function to get all Sundays in a month - IMPROVED
// function getSundaysInMonth(month, year) {
//   const sundays = [];
//   const date = new Date(year, month - 1, 1); // Month is 0-indexed in JavaScript Date

//   // Validate the date
//   if (isNaN(date.getTime())) {
//     throw new Error(`Invalid month/year combination: ${month}/${year}`);
//   }

//   // Find first Sunday of the month
//   while (date.getDay() !== 0 && date.getMonth() === month - 1) {
//     date.setDate(date.getDate() + 1);
//   }

//   // If we went to next month, return empty array
//   if (date.getMonth() !== month - 1) {
//     return [];
//   }

//   // Get all Sundays in the month
//   while (date.getMonth() === month - 1) {
//     sundays.push(new Date(date));
//     date.setDate(date.getDate() + 7);
//   }

//   return sundays;
// }
