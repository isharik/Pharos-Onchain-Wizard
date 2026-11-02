let token = "";
export function setToken(value) {
  token = value;
}
export async function api(path, body, headers = {}) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      "x-pharos-token": token,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok && !result.id)
    throw new Error(result.error?.message || "Request failed");
  return result;
}
