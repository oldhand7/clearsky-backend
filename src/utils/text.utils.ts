export const chunkText = (text: string, chunkSize = 500): string[] => {
    const chunks = [];
    const sentences = text.split(/(?<=[.?!])\s+/);
    let currentChunk = "";
  
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      currentChunk += sentence + " ";
    }
    if (currentChunk) chunks.push(currentChunk);
  
    return chunks;
  };
  