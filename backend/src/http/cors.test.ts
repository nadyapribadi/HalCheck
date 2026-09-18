import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "./cors.js";

// ADR-CT-035: the local demo and the tunnel are two ways to reach the same
// app, and a single-origin (or empty-origin) configuration breaks one of them
// in the browser only -- which is how it survived every curl-based check.
describe("parseAllowedOrigins", () => {
  it("defaults to the local frontend when nothing is configured", () => {
    expect(parseAllowedOrigins(undefined)).toEqual(["http://localhost:5173"]);
    // An `.env` line reading `ALLOWED_ORIGIN=` is unset, not "allow nothing":
    // an empty allow-list denies every browser origin, reproducing the very
    // failure this parsing exists to prevent.
    expect(parseAllowedOrigins("")).toEqual(["http://localhost:5173"]);
    expect(parseAllowedOrigins("   ")).toEqual(["http://localhost:5173"]);
    expect(parseAllowedOrigins(",,")).toEqual(["http://localhost:5173"]);
  });

  it("keeps a single origin working", () => {
    expect(parseAllowedOrigins("https://demo.example.com")).toEqual(["https://demo.example.com"]);
  });

  it("accepts a comma-separated list, tolerating spaces and empty entries", () => {
    expect(parseAllowedOrigins("http://localhost:5173, https://demo.example.com ,,")).toEqual([
      "http://localhost:5173",
      "https://demo.example.com",
    ]);
  });
});
