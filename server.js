const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const dotenv = require("dotenv");
const session = require("cookie-session");
const bcrypt = require("bcrypt");

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      name: "my_session_cookie",
      secure: false,
      httpOnly: true,
      maxAge: 3600000,
    },
  })
);

const db = mysql.createConnection({
  database: process.env.MYSQLDATABASE,
  host: process.env.MYSQLHOST,
  password: process.env.MYSQLPASSWORD,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    process.exit(1);
  }
  console.log("MySQL Connected");
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  const userEmail = req.session.userEmail;

  const isLoggedIn = !!userEmail;

  const sql = `
    SELECT u.id, u.name, u.image, u.email, u.price, r.profile_image, r.name AS register_name
    FROM users u
    LEFT JOIN register r ON u.email = r.email
  `;

  const sqltwo = "SELECT name, profile_image FROM register WHERE email = ?";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching data from database:", err);
      return res.status(500).send("Internal Server Error");
    }

    if (isLoggedIn) {
      db.query(sqltwo, [userEmail], (err, resultTwo) => {
        if (err) {
          console.error("Error fetching user image from database:", err);
          return res.status(500).send("Internal Server Error");
        }

        if (resultTwo.length > 0) {
          const userImage = resultTwo[0].profile_image;
          res.render("index", {
            yourimage: userImage,
            users: results,
            isLoggedIn,
          });
        } else {
          res.render("index", {
            users: results,
            isLoggedIn,
          });
        }
      });
    } else {
      res.render("index", {
        users: results,
        isLoggedIn,
      });
    }
  });
});

app.post("/inbox", (req, res) => {
  const buyername = req.body.buyername;
  const buyeremail = req.body.buyeremail;
  const buyerprice = req.body.buyerprice;
  const userId = req.body.userid;

  const checkUserSql = "SELECT * FROM users WHERE id = ?";
  db.query(checkUserSql, [userId], (err, userResult) => {
    if (err) {
      console.error("Error checking user in MySQL:", err);
      return res.status(500).send("Internal Server Error");
    }
    if (userResult.length === 0) {
      return res.status(404).send("User not found");
    }

    const currentUser = userResult[0];

    const insertSql =
      "INSERT INTO user_buyers (user_id, buyername, buyeremail, buyerprice) VALUES (?, ?, ?, ?)";
    db.query(
      insertSql,
      [userId, buyername, buyeremail, buyerprice],
      (err, result) => {
        if (err) {
          console.error("Error inserting data into MySQL:", err);
          return res.status(500).send("Internal Server Error");
        }
        console.log("Data inserted successfully into user_buyers table");
        res.redirect("/");
      }
    );
  });
});

app.get("/inbox", (req, res) => {
  const userEmail = req.session.userEmail;

  const isLoggedIn = !!userEmail;

  const sql =
    "SELECT ub.user_id, u.name, u.image, u.price, ub.buyername, ub.buyeremail, ub.buyerprice FROM user_buyers ub INNER JOIN users u ON ub.user_id = u.id WHERE u.email = ?";

  db.query(sql, [userEmail], (err, results) => {
    if (err) {
      console.error("Error fetching data from MySQL:", err);
      return res.status(500).send("Internal Server Error");
    }

    res.render("inbox", { users: results, isLoggedIn });
  });
});

app.get("/search", (req, res) => {
  const userEmail = req.session.userEmail;

  const isLoggedIn = !!userEmail;

  const searchQuery = req.query.query;

  const sql = `
    SELECT u.id, u.name, u.image, u.price, u.email, r.profile_image, r.name AS register_name
    FROM users u
    LEFT JOIN register r ON u.email = r.email
    WHERE u.name LIKE ?
  `;

  const sqltwo = "SELECT name, profile_image FROM register WHERE email = ?";

  db.query(sql, [`%${searchQuery}%`], (err, results) => {
    if (err) {
      console.error("Error fetching data from database:", err);
      return res.status(500).send("Internal Server Error");
    }

    if (isLoggedIn) {
      db.query(sqltwo, [userEmail], (err, resultTwo) => {
        if (err) {
          console.error("Error fetching user image from database:", err);
          return res.status(500).send("Internal Server Error");
        }

        if (resultTwo.length > 0) {
          const userImage = resultTwo[0].profile_image;
          res.render("index", {
            yourimage: userImage,
            users: results,
            searchQuery: searchQuery,
            filteredUsers: results,
            isLoggedIn,
          });
        } else {
          res.render("index", {
            users: results,
            searchQuery: searchQuery,
            filteredUsers: results,
            isLoggedIn,
          });
        }
      });
    } else {
      res.render("index", {
        users: results,
        searchQuery: searchQuery,
        filteredUsers: results,
        isLoggedIn,
      });
    }
  });
});

app.get("/inventory", (req, res) => {
  const userEmail = req.session.userEmail;

  const isLoggedIn = !!userEmail;

  if (!isLoggedIn) {
    return res.redirect("/login");
  }

  const sql = "SELECT id, name, image, price FROM users WHERE email = ?";
  db.query(sql, [userEmail], (err, results) => {
    if (err) {
      console.error("Error fetching data from database:", err);
      return res.status(500).send("Internal Server Error");
    }

    res.render("inventory", {
      users: results,
      isLoggedIn,
    });
  });
});

app.post("/update", upload.single("image"), (req, res) => {
  const userId = req.body.userId;
  const newName = req.body.name;
  const newPrice = req.body.price;
  const newImage = req.file ? req.file.filename : null;

  if (!userId) {
    return res.status(400).send("User ID is required");
  }

  const getUserSql = "SELECT * FROM users WHERE id = ?";
  db.query(getUserSql, [userId], (err, result) => {
    if (err) {
      console.error("Error retrieving user data from database:", err);
      return res.status(500).send("Internal Server Error");
    }

    if (result.length === 0) {
      return res.status(404).send("User not found");
    }

    const currentUser = result[0];

    const updatedName = newName ? newName : currentUser.name;
    const updatedPrice = newPrice ? newPrice : currentUser.price;
    const updatedImage = newImage ? newImage : currentUser.image;

    const updateSql =
      "UPDATE users SET name = ?, image = ?, price = ? WHERE id = ?";
    db.query(
      updateSql,
      [updatedName, updatedImage, updatedPrice, userId],
      (err, result) => {
        if (err) {
          console.error("Error updating user data in database:", err);
          return res.status(500).send("Internal Server Error");
        }
        console.log("User data updated successfully");
        res.redirect("/inventory");
      }
    );
  });
});

app.post("/delete", (req, res) => {
  const itemId = req.body.itemId;

  if (!itemId) {
    return res.status(400).send("Item ID is required");
  }

  const sql = "DELETE FROM users WHERE id = ?";
  db.query(sql, [itemId], (err, result) => {
    if (err) {
      console.error("Error deleting item from database:", err);
      return res.status(500).send("Internal Server Error");
    }
    console.log("Item deleted successfully");
    res.redirect("/inventory");
  });
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/register", (req, res) => {
  const name = req.body.name;
  const email = req.body.email;
  const password = req.body.password;
  const confirmPassword = req.body.confirmPassword;

  if (!name || !email || !password || !confirmPassword) {
    return res.render("register", { error: "Please fill in all fields" });
  }

  if (password !== confirmPassword) {
    return res.render("register", {
      error: "Password and Confirm Password do not match",
    });
  }

  db.query(
    "SELECT * FROM register WHERE email = ?",
    email,
    function (err, result) {
      if (err) {
        console.log("ERROR:", err);
        res.render("register", {
          error: "An error occurred during registration",
        });
      } else {
        if (result.length === 0) {
          bcrypt.hash(password, 10, function (err, hash) {
            if (err) {
              console.log("ERROR:", err);
              res.render("register", {
                error: "An error occurred during registration",
              });
            } else {
              db.query(
                "INSERT INTO register (name, email, password) VALUES (?, ?, ?)",
                [name, email, hash],
                function (err, result) {
                  if (err) {
                    console.log("ERROR:", err);
                    res.render("register", {
                      error: "An error occurred during registration",
                    });
                  } else {
                    console.log("Inserted " + result.affectedRows + " row");
                    res.redirect("/login");
                  }
                }
              );
            }
          });
        } else {
          res.render("register", {
            error: "User with the same email already exists",
          });
        }
      }
    }
  );
});

app.post("/login", (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  if (!email || !password) {
    return res.render("login", { error: "Please fill in all fields" });
  }

  db.query(
    "SELECT * FROM register WHERE email = ?",
    email,
    function (err, result) {
      if (err) {
        console.log("ERROR:", err);
        res.render("login", { error: "An error occurred during login" });
      } else {
        if (result.length > 0) {
          const hash = result[0].password;
          bcrypt.compare(password, hash, function (err, isValid) {
            if (isValid) {
              req.session.userId = result[0].id;
              req.session.userEmail = email;
              res.redirect("/profile");
            } else {
              res.render("login", { error: "Invalid login credentials" });
            }
          });
        } else {
          res.render("login", { error: "User not found" });
        }
      }
    }
  );
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.get("/changepassword", (req, res) => {
  res.render("changepassword", { error: null });
});

app.post("/change-password", (req, res) => {
  const email = req.session.userEmail;
  const currentPassword = req.body.currentPassword;
  const newPassword = req.body.newPassword;
  const confirmNewPassword = req.body.confirmNewPassword;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.render("changepassword", { error: "Please fill in all fields" });
  }

  if (newPassword !== confirmNewPassword) {
    return res.render("changepassword", {
      error: "New Password and Confirm New Password do not match",
    });
  }

  db.query(
    "SELECT * FROM register WHERE email = ?",
    email,
    function (err, result) {
      if (err) {
        console.log("ERROR:", err);
        res.render("changepassword", {
          error: "An error occurred during password change",
        });
      } else {
        if (result.length > 0) {
          const hash = result[0].password;
          bcrypt.compare(currentPassword, hash, function (err, isValid) {
            if (isValid) {
              bcrypt.hash(newPassword, 10, function (err, newHash) {
                if (err) {
                  console.log("ERROR:", err);
                  res.render("changepassword", {
                    error: "An error occurred during password change",
                  });
                } else {
                  db.query(
                    "UPDATE register SET password = ? WHERE email = ?",
                    [newHash, email],
                    function (err, updateResult) {
                      if (err) {
                        console.log("ERROR:", err);
                        res.render("changepassword", {
                          error: "An error occurred during password change",
                        });
                      } else {
                        console.log("Password changed successfully.");
                        res.redirect("/login");
                      }
                    }
                  );
                }
              });
            } else {
              res.render("changepassword", {
                error: "Invalid current password",
              });
            }
          });
        } else {
          res.render("changepassword", { error: "User not found" });
        }
      }
    }
  );
});

app.get("/profile", (req, res) => {
  const userEmail = req.session.userEmail;

  const isLoggedIn = userEmail ? true : false;

  if (isLoggedIn) {
    db.query(
      "SELECT name, profile_image FROM register WHERE email = ?",
      userEmail,
      (err, result) => {
        if (err) {
          console.error("Error querying the database:", err);
          res.render("profile", {
            yourname: "Error retrieving name",
            youremail: userEmail,
            isLoggedIn: isLoggedIn,
          });
        } else {
          if (result.length > 0) {
            const userName = result[0].name;
            const userImage = result[0].profile_image;
            res.render("profile", {
              yourimage: userImage,
              yourname: userName,
              youremail: userEmail,
              isLoggedIn: isLoggedIn,
            });
          } else {
            res.render("profile", {
              yourimage: "Image not found",
              yourname: "User not found",
              youremail: userEmail,
              isLoggedIn: isLoggedIn,
            });
          }
        }
      }
    );
  } else {
    res.render("profile", {
      yourimage: "User image not found",
      yourname: "User email not found",
      youremail: "No email available",
      isLoggedIn: isLoggedIn,
    });
  }
});

app.get("/logout", (req, res) => {
  if (req.session) {
    req.session = null;
    res.redirect("/");
  } else {
    res.redirect("/login");
  }
});

app.post("/submit", upload.single("image"), (req, res) => {
  const userEmail = req.session.userEmail;
  const name = req.body.name;
  const price = req.body.price;
  const image = req.file ? req.file.filename : null;

  if (!userEmail) {
    return res.status(401).send("Unauthorized");
  }

  const sql =
    "INSERT INTO users (name, image, email, price) VALUES (?, ?, ?, ?)";
  db.query(sql, [name, image, userEmail, price], (err, result) => {
    if (err) {
      console.error("Error inserting data into database:", err);
      return res.status(500).send("Internal Server Error");
    }
    console.log("1 record inserted");
    res.redirect("/inventory");
  });
});

app.post("/pimage", upload.single("profile_image"), (req, res) => {
  const userEmail = req.session.userEmail;
  const profile_image = req.file ? req.file.filename : null;

  if (!userEmail) {
    return res.status(401).send("Unauthorized");
  }

  const sql = "UPDATE register SET profile_image = ? WHERE email = ?";
  db.query(sql, [profile_image, userEmail], (err, result) => {
    if (err) {
      console.error("Error updating user's image:", err);
      return res.status(500).send("Internal Server Error");
    }
    console.log("User's image updated successfully");
    res.redirect("/profile");
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// CREATE TABLE register (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   name VARCHAR(255) NOT NULL DEFAULT 'NONE',
//   email VARCHAR(255) NOT NULL DEFAULT 'NONE',
//   password VARCHAR(255) NOT NULL DEFAULT 'NONE',
//   profile_image BLOB
// );

// CREATE TABLE users (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   name VARCHAR(255) NOT NULL,
//   image BLOB,
//   email VARCHAR(255) NOT NULL,
//   price DECIMAL(10, 2) NOT NULL
// );

// CREATE TABLE user_buyers (
//   id INT PRIMARY KEY AUTO_INCREMENT,
//   user_id INT,
//   buyername VARCHAR(255),
//   buyeremail VARCHAR(255),
//   buyerprice DECIMAL(10, 2),
//   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
// );
