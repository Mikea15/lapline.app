// Minimal ambient types for the File System Access API (deviceSyncStore in
// stores.svelte.ts). TypeScript's bundled lib.dom.d.ts ships an older
// FileSystemDirectoryHandle shape with no directory iteration or permission
// methods and no Window.showDirectoryPicker - this fills in just the pieces
// this app actually calls, rather than pulling in a whole third-party types
// package for a handful of methods. Chrome/Edge/Opera only; unsupported
// browsers are gated out at runtime via deviceSyncStore.supported.

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<'granted' | 'denied' | 'prompt'>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
