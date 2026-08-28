// Loaded before any test file -- every module under src/ reads env vars at
// import time (JWT_SECRET, DATABASE_URL, FABRIC_*), so this must run first.
import "dotenv/config";
