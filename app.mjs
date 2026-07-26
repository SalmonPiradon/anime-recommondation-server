import "dotenv/config";
import express from "express";
import cors from "cors";
import pool from "./utils/db.mjs";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173", // Frontend local (Vite)
      "http://localhost:3000", // Frontend local (React แบบอื่น)
      "https://anime-recommondation.vercel.app", // Frontend ที่ Deploy แล้ว
    ],
  })
);

// test connection to database
app.get("/health", (req, res) => {
  res.status(200).json({ message: "OK" });
});

app.post("/posts", async (req, res) => {
  try {
    const { title, image, category_id, description, content, status_id } = req.body;
    if (!title || !image || !category_id || !description || !content || !status_id) {
      return res.status(400).json({ message: "Server could not create post because there are missing data from client" });
    }
    await pool.query("INSERT INTO posts (title, image, category_id, description, content, status_id) VALUES ($1, $2, $3, $4, $5, $6)", [title, image, category_id, description, content, status_id]);
    res.status(201).json({ message: "Created post successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server could not create post because database connection" });
  }
});

app.get("/posts/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const postData = await pool.query(
      `SELECT
         posts.id,
         posts.image,
         categories.name AS category,
         posts.title,
         posts.description,
         posts.date,
         posts.content,
         statuses.status AS status,
         posts.likes_count
       FROM posts
       LEFT JOIN categories 
       ON posts.category_id = categories.id
       LEFT JOIN statuses 
       ON posts.status_id = statuses.id
       WHERE posts.id = $1`,
      [postId]
    );
    if (!postData.rows[0]) {
      return res.status(404).json({ message: "Server could not find a requested post" });
    }
    return res.status(200).json( postData.rows[0] );
  } catch (error) {
    return res.status(500).json({ message: "Server could not read post because database connection" });
  }
});

app.put("/posts/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const { title, image, category_id, description, content, status_id } = req.body;
    const postData = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);

    if (!postData.rows[0]) {
      return res.status(404).json({ message: "Server could not find a requested post to update" });
    }
    await pool.query(
      "UPDATE posts SET title = $1, image = $2, category_id = $3, description = $4, content = $5, status_id = $6 WHERE id = $7",
      [title, image, category_id, description, content, status_id, postId],
    );
    return res.status(200).json({ message: "Updated post successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server could not update post because database connection" });
  }
});

app.delete("/posts/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const postData = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);
    if (!postData.rows[0]) {
      return res.status(404).json({ message: "Server could not find a requested post to delete" });
    }
    await pool.query("DELETE FROM posts WHERE id = $1", [postId]);
    return res.status(200).json({ message: "Deleted post successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server could not delete post because database connection" });
  }
});

app.get("/posts", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const category = req.query.category;
    const keyword = req.query.keyword;
    const offset = (page - 1) * limit;

    const selectPosts = `
      SELECT
        posts.id,
        posts.image,
        categories.name AS category,
        posts.title,
        posts.description,
        posts.date,
        posts.content,
        statuses.status AS status,
        posts.likes_count
      FROM posts
      LEFT JOIN categories ON posts.category_id = categories.id
      LEFT JOIN statuses ON posts.status_id = statuses.id
    `;

    const fromWithJoins = `
      FROM posts
      LEFT JOIN categories ON posts.category_id = categories.id
      LEFT JOIN statuses ON posts.status_id = statuses.id
    `;

    let result;
    let totalPosts;

    if (category && keyword) {
      const count = await pool.query(
        `SELECT COUNT(*) ${fromWithJoins}
         WHERE categories.name ILIKE $1
           AND (posts.title ILIKE $2 OR posts.description ILIKE $2 OR posts.content ILIKE $2)`,
        [category, `%${keyword}%`]
      );
      totalPosts = Number(count.rows[0].count);

      result = await pool.query(
        `${selectPosts}
         WHERE categories.name ILIKE $1
           AND (posts.title ILIKE $2 OR posts.description ILIKE $2 OR posts.content ILIKE $2)
         ORDER BY posts.id DESC
         LIMIT $3 OFFSET $4`,
        [category, `%${keyword}%`, limit, offset]
      );
    } else if (category) {
      const count = await pool.query(
        `SELECT COUNT(*) ${fromWithJoins}
         WHERE categories.name ILIKE $1`,
        [category]
      );
      totalPosts = Number(count.rows[0].count);

      result = await pool.query(
        `${selectPosts}
         WHERE categories.name ILIKE $1
         ORDER BY posts.id DESC
         LIMIT $2 OFFSET $3`,
        [category, limit, offset]
      );
    } else if (keyword) {
      const count = await pool.query(
        `SELECT COUNT(*) ${fromWithJoins}
         WHERE posts.title ILIKE $1
            OR posts.description ILIKE $1
            OR posts.content ILIKE $1`,
        [`%${keyword}%`]
      );
      totalPosts = Number(count.rows[0].count);

      result = await pool.query(
        `${selectPosts}
         WHERE posts.title ILIKE $1
            OR posts.description ILIKE $1
            OR posts.content ILIKE $1
         ORDER BY posts.id DESC
         LIMIT $2 OFFSET $3`,
        [`%${keyword}%`, limit, offset]
      );
    } else {
      const count = await pool.query(`SELECT COUNT(*) FROM posts`);
      totalPosts = Number(count.rows[0].count);

      result = await pool.query(
        `${selectPosts}
         ORDER BY posts.id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }

    const totalPages = Math.ceil(totalPosts / limit) || 1;

    return res.status(200).json({
      totalPosts,
      totalPages,
      currentPage: page,
      limit,
      posts: result.rows,
      nextPage: page < totalPages ? page + 1 : null,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Server could not read post because database connection",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});