let token = "";
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export function setToken(value) {
  token = value;
}
export async function api(path, body, headers = {}) {
  const response = await fetch(`${apiBase}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      "x-pharos-token": token,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw new Error(
      "The Pharos API is not connected. Set VITE_API_BASE_URL to the deployed backend URL and redeploy the frontend.",
    );
  const result = await response.json();
  if (!response.ok && !result.id)
    throw new Error(result.error?.message || "Request failed");
  return result;
}
