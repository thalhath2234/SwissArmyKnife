export type UploadedFile = {
  id: string;
  file: File;
};

export function toUploadedFiles(list: FileList | File[], existing: UploadedFile[] = []): UploadedFile[] {
  const files = Array.from(list instanceof FileList ? list : list);
  return [
    ...existing,
    ...files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
    })),
  ];
}

export function replaceUploadedFiles(list: FileList | File[]): UploadedFile[] {
  return toUploadedFiles(list, []);
}
