#!/usr/bin/env python3
"""Add v1.38.0 l10n keys to all locales: notifications + backup & restore."""
import json
import os
import collections

LOCALES_DIR = 'src/locales'

# Key inventory (11 keys):
#   settings.notifications, settings.generationNotifications,
#   settings.generationNotificationsDescription,
#   settings.backupRestore, settings.backupRestoreButton,
#   settings.backupExportAllChats, settings.backupExportAllChatsDescription,
#   settings.backupImportChats, settings.backupImportChatsDescription,
#   notifications.generating, notifications.responseReady
T = {
    'en': {
        'settings': {
            'notifications': 'Notifications',
            'generationNotifications': 'Response completion notifications',
            'generationNotificationsDescription': 'Keeps generation running in the background and shows a notification with a preview of the reply when it completes.',
            'backupRestore': 'Backup & restore',
            'backupRestoreButton': 'Restore',
            'backupExportAllChats': 'Export all chats',
            'backupExportAllChatsDescription': 'Save a JSON backup of all your chats to share or keep.',
            'backupImportChats': 'Restore chats',
            'backupImportChatsDescription': 'Import chats from a backup file created by this app.',
        },
        'notifications': {
            'generating': 'Generating response…',
            'responseReady': 'Response ready',
        },
    },
    'ar': {
        'settings': {
            'notifications': 'الإشعارات',
            'generationNotifications': 'إشعار اكتمال الرد',
            'generationNotificationsDescription': 'يُبقي التوليد يعمل في الخلفية ويعرض إشعارًا يتضمن معاينة الرد عند اكتماله.',
            'backupRestore': 'النسخ الاحتياطي والاستعادة',
            'backupRestoreButton': 'استعادة',
            'backupExportAllChats': 'تصدير كل المحادثات',
            'backupExportAllChatsDescription': 'احفظ نسخة احتياطية بصيغة JSON من جميع محادثاتك لمشاركتها أو الاحتفاظ بها.',
            'backupImportChats': 'استعادة المحادثات',
            'backupImportChatsDescription': 'استورد المحادثات من ملف نسخة احتياطية أنشأه هذا التطبيق.',
        },
        'notifications': {
            'generating': 'جارٍ توليد الرد…',
            'responseReady': 'اكتمل الرد',
        },
    },
    'be': {
        'settings': {
            'notifications': 'Апавяшчэнні',
            'generationNotifications': 'Апавяшчэнне пра завяршэнне адказу',
            'generationNotificationsDescription': 'Працягвае генерацыю ў фонавым рэжыме і паказвае апавяшчэнне з папярэднім праглядам адказу пасля завяршэння.',
            'backupRestore': 'Рэзервовае капіраванне і аднаўленне',
            'backupRestoreButton': 'Аднавіць',
            'backupExportAllChats': 'Экспартаваць усе чаты',
            'backupExportAllChatsDescription': 'Захаваць JSON-рэзервовую копію ўсіх чатаў для абмену або захавання.',
            'backupImportChats': 'Аднавіць чаты',
            'backupImportChatsDescription': 'Імпартаваць чаты з файла рэзервовай копіі, створанага гэтым прыкладаннем.',
        },
        'notifications': {
            'generating': 'Генерацыя адказу…',
            'responseReady': 'Адказ гатовы',
        },
    },
    'de': {
        'settings': {
            'notifications': 'Benachrichtigungen',
            'generationNotifications': 'Benachrichtigung bei abgeschlossenem Antwort',
            'generationNotificationsDescription': 'Lässt die Generierung im Hintergrund weiterlaufen und zeigt nach Abschluss eine Benachrichtigung mit einer Vorschau der Antwort.',
            'backupRestore': 'Sichern & Wiederherstellen',
            'backupRestoreButton': 'Wiederherstellen',
            'backupExportAllChats': 'Alle Chats exportieren',
            'backupExportAllChatsDescription': 'JSON-Backup aller Chats sichern, um es zu teilen oder aufzubewahren.',
            'backupImportChats': 'Chats wiederherstellen',
            'backupImportChatsDescription': 'Chats aus einer von dieser App erstellten Sicherungsdatei importieren.',
        },
        'notifications': {
            'generating': 'Antwort wird generiert…',
            'responseReady': 'Antwort bereit',
        },
    },
    'es': {
        'settings': {
            'notifications': 'Notificaciones',
            'generationNotifications': 'Notificaciones de respuesta completada',
            'generationNotificationsDescription': 'Mantiene la generación en segundo plano y muestra una notificación con una vista previa de la respuesta al completarse.',
            'backupRestore': 'Copia de seguridad y restauración',
            'backupRestoreButton': 'Restaurar',
            'backupExportAllChats': 'Exportar todos los chats',
            'backupExportAllChatsDescription': 'Guarda una copia de seguridad JSON de todos tus chats para compartir o conservar.',
            'backupImportChats': 'Restaurar chats',
            'backupImportChatsDescription': 'Importa chats desde un archivo de copia de seguridad creado por esta aplicación.',
        },
        'notifications': {
            'generating': 'Generando respuesta…',
            'responseReady': 'Respuesta lista',
        },
    },
    'et': {
        'settings': {
            'notifications': 'Teavitused',
            'generationNotifications': 'Vastuse valmimise teavitused',
            'generationNotificationsDescription': 'Hoiab genereerimise taustal käimas ja näitab pärast valmimist teavitust vastuse eelvaatega.',
            'backupRestore': 'Varundamine ja taastamine',
            'backupRestoreButton': 'Taasta',
            'backupExportAllChats': 'Ekspordi kõik vestlused',
            'backupExportAllChatsDescription': 'Salvesta kõigi vestluste JSON-varukoopia jagamiseks või hoidmiseks.',
            'backupImportChats': 'Taasta vestlused',
            'backupImportChatsDescription': 'Impordi vestlused selle rakenduse loodud varufailist.',
        },
        'notifications': {
            'generating': 'Vastuse genereerimine…',
            'responseReady': 'Vastus on valmis',
        },
    },
    'fa': {
        'settings': {
            'notifications': 'اعلان‌ها',
            'generationNotifications': 'اعلان تکمیل پاسخ',
            'generationNotificationsDescription': 'تولید را در پس‌زمینه ادامه می‌دهد و پس از تکمیل، اعلانی همراه با پیش‌نمایش پاسخ نشان می‌دهد.',
            'backupRestore': 'پشتیبان‌گیری و بازیابی',
            'backupRestoreButton': 'بازیابی',
            'backupExportAllChats': 'خروجی گرفتن از همه گفتگوها',
            'backupExportAllChatsDescription': 'از همه گفتگوهای خود نسخه پشتیبان JSON ذخیره کنید تا به اشتراک بگذارید یا نگه دارید.',
            'backupImportChats': 'بازیابی گفتگوها',
            'backupImportChatsDescription': 'گفتگوها را از فایل پشتیبان ساخته‌شده توسط این برنامه وارد کنید.',
        },
        'notifications': {
            'generating': 'در حال تولید پاسخ…',
            'responseReady': 'پاسخ آماده است',
        },
    },
    'fr': {
        'settings': {
            'notifications': 'Notifications',
            'generationNotifications': 'Notifications de réponse terminée',
            'generationNotificationsDescription': 'Maintient la génération en arrière-plan et affiche une notification avec un aperçu de la réponse une fois terminée.',
            'backupRestore': 'Sauvegarde et restauration',
            'backupRestoreButton': 'Restaurer',
            'backupExportAllChats': 'Exporter toutes les discussions',
            'backupExportAllChatsDescription': 'Enregistrez une sauvegarde JSON de toutes vos discussions pour la partager ou la conserver.',
            'backupImportChats': 'Restaurer les discussions',
            'backupImportChatsDescription': 'Importez des discussions depuis un fichier de sauvegarde créé par cette application.',
        },
        'notifications': {
            'generating': 'Génération de la réponse…',
            'responseReady': 'Réponse prête',
        },
    },
    'he': {
        'settings': {
            'notifications': 'התראות',
            'generationNotifications': 'התראות על השלמת תשובה',
            'generationNotificationsDescription': 'ממשיך את היצירה ברקע ומציג התראה עם תצוגה מקדימה של התשובה בסיום.',
            'backupRestore': 'גיבוי ושחזור',
            'backupRestoreButton': 'שחזר',
            'backupExportAllChats': 'ייצוא כל הצ׳אטים',
            'backupExportAllChatsDescription': 'שמור גיבוי JSON של כל הצ׳אטים שלך לשיתוף או לשמירה.',
            'backupImportChats': 'שחזור צ׳אטים',
            'backupImportChatsDescription': 'ייבא צ׳אטים מקובץ גיבוי שנוצר על ידי האפליקציה הזו.',
        },
        'notifications': {
            'generating': 'מייצר תשובה…',
            'responseReady': 'התשובה מוכנה',
        },
    },
    'id': {
        'settings': {
            'notifications': 'Notifikasi',
            'generationNotifications': 'Notifikasi respons selesai',
            'generationNotificationsDescription': 'Melanjutkan pembuatan di latar belakang dan menampilkan notifikasi dengan pratinjau balasan saat selesai.',
            'backupRestore': 'Pencadangan & pemulihan',
            'backupRestoreButton': 'Pulihkan',
            'backupExportAllChats': 'Ekspor semua obrolan',
            'backupExportAllChatsDescription': 'Simpan cadangan JSON dari semua obrolan Anda untuk dibagikan atau disimpan.',
            'backupImportChats': 'Pulihkan obrolan',
            'backupImportChatsDescription': 'Impor obrolan dari file cadangan yang dibuat oleh aplikasi ini.',
        },
        'notifications': {
            'generating': 'Sedang membuat respons…',
            'responseReady': 'Respons siap',
        },
    },
    'it': {
        'settings': {
            'notifications': 'Notifiche',
            'generationNotifications': 'Notifiche di completamento risposta',
            'generationNotificationsDescription': 'Mantiene la generazione attiva in background e mostra una notifica con un\\u2019anteprima della risposta al completamento.',
            'backupRestore': 'Backup e ripristino',
            'backupRestoreButton': 'Ripristina',
            'backupExportAllChats': 'Esporta tutte le chat',
            'backupExportAllChatsDescription': 'Salva un backup JSON di tutte le tue chat da condividere o conservare.',
            'backupImportChats': 'Ripristina chat',
            'backupImportChatsDescription': 'Importa le chat da un file di backup creato da questa app.',
        },
        'notifications': {
            'generating': 'Generazione della risposta…',
            'responseReady': 'Risposta pronta',
        },
    },
    'ja': {
        'settings': {
            'notifications': '通知',
            'generationNotifications': '応答完了通知',
            'generationNotificationsDescription': 'バックグラウンドでも生成を続行し、完了時に応答のプレビュー付き通知を表示します。',
            'backupRestore': 'バックアップと復元',
            'backupRestoreButton': '復元',
            'backupExportAllChats': 'すべてのチャットをエクスポート',
            'backupExportAllChatsDescription': 'すべてのチャットのJSONバックアップを保存して、共有や保管ができます。',
            'backupImportChats': 'チャットを復元',
            'backupImportChatsDescription': 'このアプリで作成されたバックアップファイルからチャットをインポートします。',
        },
        'notifications': {
            'generating': '応答を生成中…',
            'responseReady': '応答の準備ができました',
        },
    },
    'ko': {
        'settings': {
            'notifications': '알림',
            'generationNotifications': '응답 완료 알림',
            'generationNotificationsDescription': '백그라운드에서 생성을 계속하고 완료 시 응답 미리보기가 포함된 알림을 표시합니다.',
            'backupRestore': '백업 및 복원',
            'backupRestoreButton': '복원',
            'backupExportAllChats': '모든 채팅 내보내기',
            'backupExportAllChatsDescription': '모든 채팅의 JSON 백업을 저장하여 공유하거나 보관하세요.',
            'backupImportChats': '채팅 복원',
            'backupImportChatsDescription': '이 앱에서 만든 백업 파일에서 채팅을 가져옵니다.',
        },
        'notifications': {
            'generating': '응답 생성 중…',
            'responseReady': '응답 준비 완료',
        },
    },
    'ms': {
        'settings': {
            'notifications': 'Pemberitahuan',
            'generationNotifications': 'Pemberitahuan respons selesai',
            'generationNotificationsDescription': 'Meneruskan penjanaan di latar belakang dan memaparkan pemberitahuan dengan pratonton balasan apabila selesai.',
            'backupRestore': 'Sandaran & pemulihan',
            'backupRestoreButton': 'Pulihkan',
            'backupExportAllChats': 'Eksport semua sembang',
            'backupExportAllChatsDescription': 'Simpan sandaran JSON semua sembang anda untuk dikongsi atau disimpan.',
            'backupImportChats': 'Pulihkan sembang',
            'backupImportChatsDescription': 'Import sembang daripada fail sandaran yang dicipta oleh aplikasi ini.',
        },
        'notifications': {
            'generating': 'Menjana respons…',
            'responseReady': 'Respons sedia',
        },
    },
    'pl': {
        'settings': {
            'notifications': 'Powiadomienia',
            'generationNotifications': 'Powiadomienia o ukończeniu odpowiedzi',
            'generationNotificationsDescription': 'Kontynuuje generowanie w tle i po zakończeniu wyświetla powiadomienie z podglądem odpowiedzi.',
            'backupRestore': 'Kopia zapasowa i przywracanie',
            'backupRestoreButton': 'Przywróć',
            'backupExportAllChats': 'Wyeksportuj wszystkie czaty',
            'backupExportAllChatsDescription': 'Zapisz kopię zapasową JSON wszystkich czatów, aby udostępnić lub przechować.',
            'backupImportChats': 'Przywróć czaty',
            'backupImportChatsDescription': 'Zaimportuj czaty z pliku kopii zapasowej utworzonego przez tę aplikację.',
        },
        'notifications': {
            'generating': 'Generowanie odpowiedzi…',
            'responseReady': 'Odpowiedź gotowa',
        },
    },
    'pt': {
        'settings': {
            'notifications': 'Notificações',
            'generationNotifications': 'Notificações de resposta concluída',
            'generationNotificationsDescription': 'Mantém a geração a correr em segundo plano e mostra uma notificação com uma pré-visualização da resposta ao concluir.',
            'backupRestore': 'Cópia de segurança e restauro',
            'backupRestoreButton': 'Restaurar',
            'backupExportAllChats': 'Exportar todas as conversas',
            'backupExportAllChatsDescription': 'Guarde uma cópia de segurança JSON de todas as suas conversas para partilhar ou guardar.',
            'backupImportChats': 'Restaurar conversas',
            'backupImportChatsDescription': 'Importe conversas de um ficheiro de cópia de segurança criado por esta aplicação.',
        },
        'notifications': {
            'generating': 'A gerar resposta…',
            'responseReady': 'Resposta pronta',
        },
    },
    'pt_BR': {
        'settings': {
            'notifications': 'Notificações',
            'generationNotifications': 'Notificações de resposta concluída',
            'generationNotificationsDescription': 'Mantém a geração em segundo plano e mostra uma notificação com uma prévia da resposta ao concluir.',
            'backupRestore': 'Backup e restauração',
            'backupRestoreButton': 'Restaurar',
            'backupExportAllChats': 'Exportar todas as conversas',
            'backupExportAllChatsDescription': 'Salve um backup em JSON de todas as suas conversas para compartilhar ou guardar.',
            'backupImportChats': 'Restaurar conversas',
            'backupImportChatsDescription': 'Importe conversas de um arquivo de backup criado por este aplicativo.',
        },
        'notifications': {
            'generating': 'Gerando resposta…',
            'responseReady': 'Resposta pronta',
        },
    },
    'ru': {
        'settings': {
            'notifications': 'Уведомления',
            'generationNotifications': 'Уведомления о завершении ответа',
            'generationNotificationsDescription': 'Продолжает генерацию в фоне и по завершении показывает уведомление с предпросмотром ответа.',
            'backupRestore': 'Резервное копирование и восстановление',
            'backupRestoreButton': 'Восстановить',
            'backupExportAllChats': 'Экспортировать все чаты',
            'backupExportAllChatsDescription': 'Сохраните JSON-резервную копию всех чатов, чтобы поделиться или сохранить.',
            'backupImportChats': 'Восстановить чаты',
            'backupImportChatsDescription': 'Импортируйте чаты из файла резервной копии, созданного этим приложением.',
        },
        'notifications': {
            'generating': 'Генерация ответа…',
            'responseReady': 'Ответ готов',
        },
    },
    'sv': {
        'settings': {
            'notifications': 'Aviseringar',
            'generationNotifications': 'Aviseringar när svaret är klart',
            'generationNotificationsDescription': 'Låter genereringen fortsätta i bakgrunden och visar en avisering med en förhandsgranskning av svaret när den är klar.',
            'backupRestore': 'Säkerhetskopiering och återställning',
            'backupRestoreButton': 'Återställ',
            'backupExportAllChats': 'Exportera alla chattar',
            'backupExportAllChatsDescription': 'Spara en JSON-säkerhetskopia av alla dina chattar för att dela eller spara.',
            'backupImportChats': 'Återställ chattar',
            'backupImportChatsDescription': 'Importera chattar från en säkerhetskopia skapad av den här appen.',
        },
        'notifications': {
            'generating': 'Genererar svar…',
            'responseReady': 'Svaret är klart',
        },
    },
    'uk': {
        'settings': {
            'notifications': 'Сповіщення',
            'generationNotifications': 'Сповіщення про завершення відповіді',
            'generationNotificationsDescription': 'Продовжує генерацію у фоновому режимі та після завершення показує сповіщення з попереднім переглядом відповіді.',
            'backupRestore': 'Резервне копіювання та відновлення',
            'backupRestoreButton': 'Відновити',
            'backupExportAllChats': 'Експортувати всі чати',
            'backupExportAllChatsDescription': 'Збережіть JSON-резервну копію всіх чатів, щоб поділитися або зберегти.',
            'backupImportChats': 'Відновити чати',
            'backupImportChatsDescription': 'Імпортуйте чати з файлу резервної копії, створеного цією програмою.',
        },
        'notifications': {
            'generating': 'Генерація відповіді…',
            'responseReady': 'Відповідь готова',
        },
    },
    'zh': {
        'settings': {
            'notifications': '通知',
            'generationNotifications': '回复完成通知',
            'generationNotificationsDescription': '在后台继续生成，并在完成时显示包含回复预览的通知。',
            'backupRestore': '备份与恢复',
            'backupRestoreButton': '恢复',
            'backupExportAllChats': '导出所有聊天',
            'backupExportAllChatsDescription': '将所有聊天保存为 JSON 备份，以便分享或留存。',
            'backupImportChats': '恢复聊天',
            'backupImportChatsDescription': '从此应用创建的备份文件导入聊天。',
        },
        'notifications': {
            'generating': '正在生成回复…',
            'responseReady': '回复已就绪',
        },
    },
    'zh_Hant': {
        'settings': {
            'notifications': '通知',
            'generationNotifications': '回覆完成通知',
            'generationNotificationsDescription': '在背景繼續生成，並在完成時顯示包含回覆預覽的通知。',
            'backupRestore': '備份與還原',
            'backupRestoreButton': '還原',
            'backupExportAllChats': '匯出所有聊天',
            'backupExportAllChatsDescription': '將所有聊天儲存為 JSON 備份，以便分享或保存。',
            'backupImportChats': '還原聊天',
            'backupImportChatsDescription': '由此應用程式建立的備份檔匯入聊天。',
        },
        'notifications': {
            'generating': '正在產生回覆…',
            'responseReady': '回覆已就緒',
        },
    },
}


def main():
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
        for section in ('settings', 'notifications'):
            for key, val in T[code][section].items():
                if section == 'settings' and key == 'notifications':
                    # settings.notifications is a string key; handled below.
                    pass
                if section == 'settings':
                    if key not in data['settings']:
                        data['settings'][key] = val
                else:
                    if section not in data:
                        data[section] = collections.OrderedDict()
                    if key not in data[section]:
                        data[section][key] = val
        # settings.notifications is a plain string (card title), but the
        # generic loop above would have written it into settings correctly.
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        changed += 1
    print(f'updated {changed} locales')


if __name__ == '__main__':
    main()
