// backup-system.js

document.addEventListener('DOMContentLoaded', () => {
  const backupBtn = document.getElementById('create-backup');
  const restoreInput = document.getElementById('restore-backup');
  const selectFolderBtn = document.getElementById('select-folder-btn');
  const backupFolderDisplay = document.getElementById('backup-folder-display');
  const autoBackupToggle = document.getElementById('auto-backup-toggle');

  // Load settings
  loadBackupSettings();

  if (backupBtn) {
    backupBtn.addEventListener('click', createBackup);
  }

  if (restoreInput) {
    restoreInput.addEventListener('change', restoreBackup);
  }

  if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', async () => {
      if (!window.electronAPI) {
        return alert('This feature requires the desktop application.');
      }
      const folderPath = await window.electronAPI.selectBackupFolder();
      if (folderPath) {
        localStorage.setItem('backup_path', folderPath);
        updateUI();
      }
    });
  }

  if (autoBackupToggle) {
    autoBackupToggle.addEventListener('change', (e) => {
      localStorage.setItem('backup_auto_enabled', e.target.checked);
      if (e.target.checked && !localStorage.getItem('backup_path')) {
        alert('Please select a backup folder first.');
        e.target.checked = false;
        localStorage.setItem('backup_auto_enabled', false);
      }
    });
  }

  // Run auto backup check
  runAutoBackup();
});

function loadBackupSettings() {
  const path = localStorage.getItem('backup_path');
  const enabled = localStorage.getItem('backup_auto_enabled') === 'true';

  const display = document.getElementById('backup-folder-display');
  const toggle = document.getElementById('auto-backup-toggle');

  if (display) display.textContent = path || 'No folder selected';
  if (toggle) toggle.checked = enabled;
}

function updateUI() {
  loadBackupSettings();
}


async function runAutoBackup() {
  const path = localStorage.getItem('backup_path');
  const enabled = localStorage.getItem('backup_auto_enabled') === 'true';

  if (!enabled || !path || !window.electronAPI) return;

  const today = new Date().toISOString().slice(0, 10);
  const filename = `POS-Backup-Auto-${today}.json`;

  try {
    const exists = await window.electronAPI.checkFileExists(path, filename);
    if (exists) {
      console.log('Daily backup already exists.');
      return;
    }

    // Generate data
    const data = {};
    for (let key in localStorage) {
      data[key] = localStorage.getItem(key);
    }
    const jsonContent = JSON.stringify(data, null, 2);

    const result = await window.electronAPI.saveBackupFile(path, filename, jsonContent);
    if (result.success) {
      console.log('Auto backup created successfully at:', result.path);
      // Optional: Show a subtle toast notification
    } else {
      console.error('Auto backup failed:', result.error);
    }
  } catch (e) {
    console.error('Error running auto backup:', e);
  }
}

function createBackup() {
  const data = {};
  for (let key in localStorage) {
    data[key] = localStorage.getItem(key);
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  const filename = `POS-backup-${new Date().toISOString().slice(0, 10)}.json`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  alert('Backup file created successfully.');
}

function restoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return alert('No file selected.');

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!confirm('Are you sure? This will overwrite all current data.')) return;

      localStorage.clear();
      for (let key in data) {
        localStorage.setItem(key, data[key]);
      }
      alert('Backup restored successfully. Reloading...');
      location.reload();
    } catch (err) {
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}
