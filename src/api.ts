const token = window.location.hash.slice(1);

export async function api<T>(
  route: string,
  params: Record<string, string> = {},
  init?: RequestInit,
): Promise<T> {
  let response;
  try {
    response = await fetch(`/api/${route}?${new URLSearchParams(params)}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(
      "The polydiff server stopped responding. Is it still running?",
      { cause: error },
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "Start polydiff in your terminal and open the URL it prints.",
    );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
export function post<T>(route: string, body: unknown) {
  return api<T>(route, {}, { method: "POST", body: JSON.stringify(body) });
}
