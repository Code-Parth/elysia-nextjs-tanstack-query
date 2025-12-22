import { treaty } from "@elysiajs/eden";
import { app } from "@/app/api/[[...slug]]/route";

// .api to enter /api prefix
export const api =
  typeof process !== "undefined"
    ? treaty(app).api
    : treaty<typeof app>("localhost:3000").api;
