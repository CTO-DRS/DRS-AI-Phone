#!/usr/bin/env python3
"""Add v1.39.0 l10n keys to all locales: assistant backup/restore in Settings.

Keys added under `settings`:
  backupExportAssistants, backupExportAssistantsDescription,
  backupImportAssistants, backupImportAssistantsDescription
"""
import json
import os
import collections

LOCALES_DIR = 'src/locales'

T = {
    'en': {
        'backupExportAssistants': 'Export assistants',
        'backupExportAssistantsDescription': 'Save a JSON backup of all your assistants to share or keep.',
        'backupImportAssistants': 'Restore assistants',
        'backupImportAssistantsDescription': 'Import assistants from a backup file created by this app.',
    },
    'ar': {
        'backupExportAssistants': 'تصدير المساعدين',
        'backupExportAssistantsDescription': 'احفظ نسخة احتياطية بصيغة JSON من جميع مساعديك لمشاركتها أو الاحتفاظ بها.',
        'backupImportAssistants': 'استعادة المساعدين',
        'backupImportAssistantsDescription': 'استورد المساعدين من ملف نسخة احتياطية أنشأه هذا التطبيق.',
    },
    'be': {
        'backupExportAssistants': 'Экспартаваць памочнікаў',
        'backupExportAssistantsDescription': 'Захаваць JSON-рэзервовую копію ўсіх памочнікаў для абмену або захавання.',
        'backupImportAssistants': 'Аднавіць памочнікаў',
        'backupImportAssistantsDescription': 'Імпартаваць памочнікаў з файла рэзервовай копіі, створанага гэтым прыкладаннем.',
    },
    'de': {
        'backupExportAssistants': 'Assistenten exportieren',
        'backupExportAssistantsDescription': 'JSON-Backup aller Assistenten sichern, um es zu teilen oder aufzubewahren.',
        'backupImportAssistants': 'Assistenten wiederherstellen',
        'backupImportAssistantsDescription': 'Assistenten aus einer von dieser App erstellten Sicherungsdatei importieren.',
    },
    'es': {
        'backupExportAssistants': 'Exportar asistentes',
        'backupExportAssistantsDescription': 'Guarda una copia de seguridad JSON de todos tus asistentes para compartir o conservar.',
        'backupImportAssistants': 'Restaurar asistentes',
        'backupImportAssistantsDescription': 'Importa asistentes desde un archivo de copia de seguridad creado por esta aplicación.',
    },
    'et': {
        'backupExportAssistants': 'Ekspordi abilised',
        'backupExportAssistantsDescription': 'Salvesta kõigi abiliste JSON-varukoopia jagamiseks või hoidmiseks.',
        'backupImportAssistants': 'Taasta abilised',
        'backupImportAssistantsDescription': 'Impordi abilised selle rakenduse loodud varukoopia failist.',
    },
    'fa': {
        'backupExportAssistants': 'دریافت خروجی دستیارها',
        'backupExportAssistantsDescription': 'یک نسخه پشتیبان JSON از همه دستیارهای خود ذخیره کنید تا هم‌رسانی یا نگه‌داری کنید.',
        'backupImportAssistants': 'بازیابی دستیارها',
        'backupImportAssistantsDescription': 'دستیارها را از فایل نسخه پشتیبانی که این برنامه ساخته است وارد کنید.',
    },
    'fr': {
        'backupExportAssistants': 'Exporter les assistants',
        'backupExportAssistantsDescription': 'Enregistrez une sauvegarde JSON de tous vos assistants pour la partager ou la conserver.',
        'backupImportAssistants': 'Restaurer les assistants',
        'backupImportAssistantsDescription': 'Importez des assistants depuis un fichier de sauvegarde créé par cette application.',
    },
    'he': {
        'backupExportAssistants': 'ייצוא העוזרים',
        'backupExportAssistantsDescription': 'שמור גיבוי JSON של כל העוזרים שלך לשיתוף או לשמירה.',
        'backupImportAssistants': 'שחזור העוזרים',
        'backupImportAssistantsDescription': 'ייבא עוזרים מקובץ גיבוי שנוצר על ידי האפליקציה הזו.',
    },
    'id': {
        'backupExportAssistants': 'Ekspor asisten',
        'backupExportAssistantsDescription': 'Simpan cadangan JSON dari semua asisten Anda untuk dibagikan atau disimpan.',
        'backupImportAssistants': 'Pulihkan asisten',
        'backupImportAssistantsDescription': 'Impor asisten dari file cadangan yang dibuat oleh aplikasi ini.',
    },
    'it': {
        'backupExportAssistants': 'Esporta assistenti',
        'backupExportAssistantsDescription': 'Salva un backup JSON di tutti i tuoi assistenti per condividerlo o conservarlo.',
        'backupImportAssistants': 'Ripristina assistenti',
        'backupImportAssistantsDescription': 'Importa assistenti da un file di backup creato da questa app.',
    },
    'ja': {
        'backupExportAssistants': 'アシスタントをエクスポート',
        'backupExportAssistantsDescription': 'すべてのアシスタントのJSONバックアップを保存して、共有や保管ができます。',
        'backupImportAssistants': 'アシスタントを復元',
        'backupImportAssistantsDescription': 'このアプリで作成したバックアップファイルからアシスタントをインポートします。',
    },
    'ko': {
        'backupExportAssistants': '어시스턴트 내보내기',
        'backupExportAssistantsDescription': '모든 어시스턴트의 JSON 백업을 저장하여 공유하거나 보관하세요.',
        'backupImportAssistants': '어시스턴트 복원',
        'backupImportAssistantsDescription': '이 앱에서 만든 백업 파일에서 어시스턴트를 가져옵니다.',
    },
    'ms': {
        'backupExportAssistants': 'Eksport pembantu',
        'backupExportAssistantsDescription': 'Simpan sandaran JSON semua pembantu anda untuk dikongsi atau disimpan.',
        'backupImportAssistants': 'Pulihkan pembantu',
        'backupImportAssistantsDescription': 'Import pembantu daripada fail sandaran yang dibuat oleh aplikasi ini.',
    },
    'pl': {
        'backupExportAssistants': 'Eksportuj asystentów',
        'backupExportAssistantsDescription': 'Zapisz kopię zapasową JSON wszystkich asystentów, aby udostępnić ją lub przechować.',
        'backupImportAssistants': 'Przywróć asystentów',
        'backupImportAssistantsDescription': 'Importuj asystentów z pliku kopii zapasowej utworzonego przez tę aplikację.',
    },
    'pt': {
        'backupExportAssistants': 'Exportar assistentes',
        'backupExportAssistantsDescription': 'Guarde uma cópia de segurança JSON de todos os seus assistentes para partilhar ou conservar.',
        'backupImportAssistants': 'Restaurar assistentes',
        'backupImportAssistantsDescription': 'Importe assistentes de um ficheiro de cópia de segurança criado por esta aplicação.',
    },
    'pt_BR': {
        'backupExportAssistants': 'Exportar assistentes',
        'backupExportAssistantsDescription': 'Salve um backup JSON de todos os seus assistentes para compartilhar ou manter.',
        'backupImportAssistants': 'Restaurar assistentes',
        'backupImportAssistantsDescription': 'Importe assistentes de um arquivo de backup criado por este aplicativo.',
    },
    'ru': {
        'backupExportAssistants': 'Экспортировать помощников',
        'backupExportAssistantsDescription': 'Сохраните JSON-резервную копию всех помощников, чтобы поделиться ею или сохранить.',
        'backupImportAssistants': 'Восстановить помощников',
        'backupImportAssistantsDescription': 'Импортируйте помощников из файла резервной копии, созданного этим приложением.',
    },
    'sv': {
        'backupExportAssistants': 'Exportera assistenter',
        'backupExportAssistantsDescription': 'Spara en JSON-säkerhetskopia av alla dina assistenter för att dela eller behålla den.',
        'backupImportAssistants': 'Återställ assistenter',
        'backupImportAssistantsDescription': 'Importera assistenter från en säkerhetskopia som skapats av den här appen.',
    },
    'uk': {
        'backupExportAssistants': 'Експортувати помічників',
        'backupExportAssistantsDescription': 'Збережіть JSON-резервну копію всіх помічників, щоб поділитися нею або зберегти.',
        'backupImportAssistants': 'Відновити помічників',
        'backupImportAssistantsDescription': 'Імпортуйте помічників із файлу резервної копії, створеного цією програмою.',
    },
    'zh': {
        'backupExportAssistants': '导出助手',
        'backupExportAssistantsDescription': '将所有助手的 JSON 备份保存起来，方便分享或留存。',
        'backupImportAssistants': '恢复助手',
        'backupImportAssistantsDescription': '从本应用创建的备份文件中导入助手。',
    },
    'zh_Hant': {
        'backupExportAssistants': '匯出助理',
        'backupExportAssistantsDescription': '儲存所有助理的 JSON 備份，方便分享或保存。',
        'backupImportAssistants': '還原助理',
        'backupImportAssistantsDescription': '從此應用程式建立的備份檔匯入助理。',
    },
}

# Insertion anchor: keep the assistant rows grouped with the v1.38.0
# backup rows (insert right after backupImportChatsDescription when it
# exists, otherwise append).
ANCHOR = 'backupImportChatsDescription'


def main() -> None:
    changed = 0
    for loc in sorted(os.listdir(LOCALES_DIR)):
        if not loc.endswith('.json'):
            continue
        code = loc[:-5]
        if code not in T:
            raise SystemExit(f'missing translations for locale: {code}')
        path = os.path.join(LOCALES_DIR, loc)
        with open(path, encoding='utf-8') as fh:
            data = json.load(fh, object_pairs_hook=collections.OrderedDict)
        section = data['settings']
        missing = [k for k in T[code] if k not in section]
        if not missing:
            continue
        if ANCHOR in section:
            rebuilt = collections.OrderedDict()
            for key, val in section.items():
                rebuilt[key] = val
                if key == ANCHOR:
                    for k, v in T[code].items():
                        rebuilt[k] = v
            data['settings'] = rebuilt
        else:
            for k, v in T[code].items():
                section[k] = v
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        changed += 1
    print(f'updated {changed} locales')


if __name__ == '__main__':
    main()
