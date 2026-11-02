import { createInterface } from "node:readline";
import { hashPassword } from "../backend/src/auth.js";
process.stdout.write(
  "Enter an administrator password (minimum 16 characters): ",
);
let password = "";
if (!process.stdin.isTTY)
  throw new Error("Run this command in an interactive terminal");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (chunk === "\u0003") {
    process.stdin.setRawMode(false);
    process.exit(1);
  }
  if (chunk === "\r" || chunk === "\n") {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    if (password.length < 16) {
      console.error("\nPassword is too short.");
      process.exit(1);
    }
    console.log(
      "\nSet this server-side environment value:\nADMIN_PASSWORD_HASH=" +
        hashPassword(password),
    );
    password = "";
    process.exit(0);
  }
  if (chunk === "\u007f" || chunk === "\b") password = password.slice(0, -1);
  else if (password.length < 512) password += chunk;
});
