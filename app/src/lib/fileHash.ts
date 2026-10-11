export const MAX_REQ_FILE_BYTES = 20 * 1024 * 1024;

export async function sha256HexOfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function taskHashInput(title: string, successCriteria: string, requirementsSha256?: string): string {
  if (!requirementsSha256) {
    return JSON.stringify({ title, successCriteria });
  }
  return JSON.stringify({ title, successCriteria, requirementsSha256 });
}
