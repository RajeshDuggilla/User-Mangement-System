const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const { v4: uuidv4 } = require("uuid");
const winston = require("winston");

app.use(express.json());

const dbPath = path.join(__dirname, "database.sqlite");

let db = null;


// Setup Winston logger
const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" }),
  ],
});

// Initialize DB and start server
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Create Tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS managers (
        manager_id TEXT PRIMARY KEY,
        is_active BOOLEAN DEFAULT 1
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        mob_num TEXT NOT NULL,
        pan_num TEXT NOT NULL,
        manager_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (manager_id) REFERENCES managers(manager_id)
      );
    `);

    // Insert default managers
    await db.run(`
      INSERT OR IGNORE INTO managers (manager_id, is_active)
      VALUES 
        ('11111111-1111-1111-1111-111111111111', 1),
        ('22222222-2222-2222-2222-222222222222', 1);
    `);

    app.listen(3000, () => {
      console.log("Server running on port 3000");
      logger.info("Server started on port 3000");
    });
  } catch (e) {
    logger.error(e.message);
    process.exit(1);
  }
};

initializeDBAndServer();

// ========== API Routes ==========

// Create User
app.post("/create_user", async (request, response) => {
  const { full_name, mob_num, pan_num, manager_id } = request.body;

  if (!full_name || !mob_num || !pan_num || !manager_id) {
    return response.status(400).send("Missing required fields");
  }

  const manager = await db.get(
    "SELECT is_active FROM managers WHERE manager_id = ?",
    [manager_id]
  );

  if (!manager || !manager.is_active) {
    return response.status(400).send("Invalid manager_id");
  }

  const user_id = uuidv4();
  try {
    await db.run(
      `INSERT INTO users (user_id, full_name, mob_num, pan_num, manager_id)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, full_name, mob_num, pan_num.toUpperCase(), manager_id]
    );
    response.send({ message: "User created successfully", user_id });
  } catch (err) {
    logger.error(err.message);
    response.status(500).send("Database error");
  }
});


// Get Users
app.post("/get_users", async (request, response) => {
  const { user_id, mob_num, manager_id } = request.body;
  let query = "SELECT * FROM users WHERE is_active = 1";
  const params = [];

  if (user_id) {
    query += " AND user_id = ?";
    params.push(user_id);
  }
  if (mob_num) {
    query += " AND mob_num = ?";
    params.push(mob_num);
  }
  if (manager_id) {
    query += " AND manager_id = ?";
    params.push(manager_id);
  }

  try {
    const users = await db.all(query, params);
    response.send({ users });
  } catch (err) {
    logger.error(err.message);
    response.status(500).send("Database error");
  }
});

// Delete User
app.post("/delete_user", async (request, response) => {
  const { user_id, mob_num } = request.body;

  if (!user_id && !mob_num) {
    return response.status(400).send("Missing required fields");
  }

  try {
    await db.run(
      "DELETE FROM users WHERE user_id = ? OR mob_num = ?",
      [user_id, mob_num]
    );
    response.send({ message: "User deleted successfully" });
  } catch (err) {
    logger.error(err.message);
    response.status(500).send("Database error");
  }
});

// Update User
app.post("/update_user", async (request, response) => {
  const { user_ids, update_data } = request.body;

  if (!user_ids || !update_data) {
    return response.status(400).send("Missing required fields");
  }

  const { manager_id } = update_data;

  if (manager_id) {
    const manager = await db.get(
      "SELECT is_active FROM managers WHERE manager_id = ?",
      [manager_id]
    );

    if (!manager || !manager.is_active) {
      return response.status(400).send("Invalid manager_id");
    }
  }

  try {
    for (const user_id of user_ids) {
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(update_data)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }

      const query = `UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`;
      values.push(user_id);

      await db.run(query, values);
    }

    response.send({ message: "Users updated successfully" });
  } catch (err) {
    logger.error(err.message);
    response.status(500).send("Database error");
  }
});

module.exports = app;
