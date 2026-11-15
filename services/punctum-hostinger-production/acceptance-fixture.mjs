import { createHash } from "node:crypto";

export const fixturePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==", "base64");
export const fixtureSha256 = createHash("sha256").update(fixturePng).digest("hex");
