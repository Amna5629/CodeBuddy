-- CodeBuddy Database Setup
-- Run: mysql -u root -p < database.sql

CREATE DATABASE IF NOT EXISTS codebuddy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE codebuddy;

CREATE TABLE IF NOT EXISTS explanations (
  id VARCHAR(36) PRIMARY KEY,
  code_snippet MEDIUMTEXT NOT NULL,
  language VARCHAR(60),
  level VARCHAR(20),
  title VARCHAR(200),
  overall_explanation LONGTEXT,
  line_explanations LONGTEXT,
  quiz LONGTEXT,
  concepts LONGTEXT,
  bookmarked TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at DESC),
  INDEX idx_bookmarked (bookmarked),
  INDEX idx_language (language)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  explanation_id VARCHAR(36),
  score INT,
  total INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_explanation (explanation_id)
);

-- Quick stats view
CREATE OR REPLACE VIEW stats_view AS
SELECT
  (SELECT COUNT(*) FROM explanations) AS total_explanations,
  (SELECT COUNT(*) FROM explanations WHERE bookmarked = 1) AS bookmarked,
  (SELECT COUNT(*) FROM quiz_attempts) AS quiz_attempts,
  (SELECT language FROM explanations GROUP BY language ORDER BY COUNT(*) DESC LIMIT 1) AS top_language;
