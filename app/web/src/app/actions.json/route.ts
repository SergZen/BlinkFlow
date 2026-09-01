import { ACTIONS_CORS_HEADERS, type ActionsJson } from "@solana/actions";

export const GET = async () => {
  const payload: ActionsJson = {
    rules: [
      // /deal/<id> shared in a tweet -> the Action API below
      { pathPattern: "/deal/**", apiPath: "/api/actions/escrow/**" },
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  };
  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
};

export const OPTIONS = GET;
