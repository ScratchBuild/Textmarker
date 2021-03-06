import _STORAGE from './../storage'
import _DEFAULT_STORAGE from './../../data/default-storage'
import { _MODULE } from './../utils'
import { _COPY } from './../utils'

new _MODULE({
  events: {
    ENV: {
      'update:app': 'setStorageOnUpgrade',
      'install:app': 'setStorageOnUpgrade',
      'check:storage': 'checkStorageOnStart',
      'import:storage': 'importStorage'
    }
  },

  updateSettings(settings) {
    const noteTypes = 'pbmNote changedNote errorNote successNote'.split(' ');
    const defaultSettings = _DEFAULT_STORAGE.settings;

    if (!settings.shortcuts) {
      settings = defaultSettings;
    } else {
      noteTypes.forEach(noteType => {
        if (!settings.misc[noteType]) {
          settings.misc[noteType] = defaultSettings.misc[noteType];
        }
      });
      if (!settings.history.sorted) {
        settings.history.sorted = defaultSettings.history.sorted;
      }
      if (!settings.history.view) {
        settings.history.view = defaultSettings.history.view;
      }
      if (typeof settings.history.saveInPriv !== 'boolean') {
        settings.history.saveInPriv = defaultSettings.history.saveInPriv;
      }
      if (!settings.shortcuts.n) {
        settings.shortcuts.n = defaultSettings.shortcuts.n;
        settings.misc.noteicon = defaultSettings.misc.noteicon;
        settings.misc.noteonclick = defaultSettings.misc.noteonclick;
      }
      if (!settings.shortcuts.arrowup) {
        settings.shortcuts.arrowup = defaultSettings.shortcuts.arrowup;
        settings.shortcuts.arrowdown = defaultSettings.shortcuts.arrowdown;
      }
      if (!settings.misc.tmuipos) {
        settings.misc.tmuipos = defaultSettings.misc.tmuipos;
      }
      if (typeof settings.misc.notetransp !== 'boolean') {
        settings.misc.notetransp = defaultSettings.misc.notetransp;
      }
    }
    return settings;
  },
  updateHistory(history) {
    let entries = history.entries,
        order = history.order,
        l = order ? order.length : 0,
        entry;

    if (!l) return history;

    while (l--) {
      entry = this.fixHistoryDates(entries[order[l]]);
      entry.synced = typeof entry.synced === 'undefined' ? true : entry.synced;
    }
    return history;
  },
  fixHistoryDates(entry) {
    const lang = browser.i18n.getMessage('lng');
    if (typeof entry.first !== 'number') entry.first = new Date((entry.first[lang] || entry.first.en || entry.first.de || entry.first).replace(/\./g,' ')).getTime();
    if (typeof entry.last !== 'number') entry.last = new Date((entry.last[lang] || entry.last.en || entry.last.de || entry.last).replace(/\./g,' ')).getTime();
    return entry;
  },
  fixHistory(history) {
    history = history || {};

    var entries = history.entries || {},
        order = history.order || [],
        l = order.length;

    if (l) {
      while (l--)
        if (!entries[order[l]]) order.splice(l, 1);
    }

    for (var name in entries)
      if (!order.includes(name)) order.push(name);

    return history;
  },
  mergeHistories(newHistory, area) {
    return _STORAGE.get('history').then(oldHistory => {

      let order = newHistory.order,
          entries = newHistory.entries,
          l = order.length,
          i = 0,
          oldOrder = oldHistory.order,
          oldEntries = oldHistory.entries,
          acceptedEntries = {},
          name, entry, url, urlExists, e;

      for (; i < l; i++) {
        name = order[i];
        urlExists = false;

        if (!oldOrder.includes(name)) {
          entry = entries[name];
          url = entry.url;

          for (e in oldEntries) {
            if (oldEntries[e].url === url) {
              urlExists = true;
              break;
            }
          }
          if (!urlExists) {
            entry.synced = area === 'sync';
            acceptedEntries[name] = entry;
          }
        }
      }

      return _STORAGE.update('history', history => {
        const _order = history.order;
        const _entries = history.entries;

        for (let a in acceptedEntries) {
          _entries[a] = acceptedEntries[a];
          _order.push(a);
        }console.log(area, history);
        return history;
      }, area);
    });
  },

  setStorageOnUpgrade(prevVersion = '2', loadReason) {
    _STORAGE.isEmpty('sync').then(empty => {
      if (empty) {
        if (loadReason !== 'install') this.emit('error', 'error_empty_synced_storage_onupdate');
      }
      return _STORAGE.set('storage', 'sync');
    })
    .then(() => _STORAGE.update('settings', settings => this.updateSettings(settings), 'sync'))
    .then(() => _STORAGE.update('settings', settings => this.updateSettings(settings), 'local'))
    .then(() => { if (prevVersion < '3') { _STORAGE.update('history', history => this.updateHistory(history), 'sync'); }})
    .then(() => _STORAGE.set('storage', 'local'))
    .then(() => this.emit('initialized:storage', prevVersion))
    .catch(() => {
      this.emit('initialized:storage', prevVersion);
      this.emit('error', 'error_storage_migration');
    });
  },
  checkStorageOnStart() {
    _STORAGE.isEmpty('sync').then(empty => {
      if (empty) {
        this.emit('error', 'error_empty_synced_storage_onstart');
      }
      return _STORAGE.set('storage', 'sync');
    })
    .then(() => _STORAGE.isEmpty('local').then(empty => {
      if (empty) {
        this.emit('error', 'error_empty_local_storage_onstart');
      }
      return _STORAGE.set('storage', 'local');
    }))
    .then(() => this.emit('checked:storage'))
    .catch(() => this.emit('checked:storage'));
  },
  importStorage(importedStorage, area) {
    let settings = importedStorage.settings,
        history = importedStorage.history;

    if (!history && !settings) this.emit('failed:import', 'error_import_empty');
    else {
      if (!history) {
        if (!settings.shortcuts) this.emit('failed:import', 'error_import_history_not_found', 'error_import_outdated');
        else this.importSettings(settings, area).then(success => {
          if (!success) this.emit('failed:import', 'error_import_history_not_found', 'error_import_settings');
          else this.emit('error:import imported:settings', 'error_import_history_not_found');
        });
      }
      else if (!settings) {
        this.importHistory(history, area).then(success => {
          if (!success) this.emit('failed:import', 'error_import_settings_not_found', 'error_import_history');
          else this.emit('imported:storage imported:history');
        });
      } else {
        this.importSettings(settings, area).then(success_s => {
          this.importHistory(history, area).then(success_h => {
            if (!success_s) {
              if (!success_h) this.emit('failed:import', 'error_import_settings', 'error_import_history');
              else this.emit('error:import imported:history', 'error_import_settings');
            } else {
              if (success_s === 'outdated') {
                if (!success_h) this.emit('failed:import', 'error_import_history', 'error_import_outdated');
                else this.emit('error:import imported:history', 'error_import_outdated');
              } else {
                if (!success_h) this.emit('error:import imported:settings', 'error_import_history');
                else this.emit('imported:storage imported:settings imported:history');
              }
            }
          });
        });
      }
    }
  },
  importSettings(settings, area) {
    if (!settings.shortcuts) return Promise.resolve('outdated');

    return _STORAGE.update('settings', settings => this.updateSettings(settings), area)
      .then(() => true)
      .catch(() => false)
  },
  importHistory(history, area) {
    return this.mergeHistories(this.updateHistory(this.fixHistory(history)), area)
      .then(() => true)
      .catch(() => false)
  }
});
