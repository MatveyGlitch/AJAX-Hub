// Общие функции для трёх страниц лабораторной работы.

const AjaxHub = {
    async post(data) {
        const response = await fetch('ajax.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: new URLSearchParams(data)
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error('Сервер вернул ответ не в формате JSON.');
        }

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Ошибка получения данных.');
        }

        return result;
    },

    saveCookie(name, value, days = 7) {
        const maxAge = days * 24 * 60 * 60;

        document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    },

    readCookie(name) {
        const prefix = `${encodeURIComponent(name)}=`;
        const parts = document.cookie.split('; ');
        const found = parts.find(part => part.startsWith(prefix));

        if (!found) {
            return null;
        }

        try {
            return JSON.parse(decodeURIComponent(found.substring(prefix.length)));
        } catch {
            return null;
        }
    }
};
