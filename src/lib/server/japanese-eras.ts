// Japanese era names without a Chinese namesake in DILA's Time Authority Database.
// Exclude an era if any of its listed spellings also occurs in the Chinese table.
// Derived from authority_time_{chinese,japanese}.sql, t_era_names, at b4cf4b4.
// https://github.com/DILA-edu/Authority-Databases/tree/b4cf4b4/authority_time
// DILA, CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/).
// Reiwa postdates that edition.
export const japaneseOnlyEras = new Set(`
大化 白雉 朱鳥 慶雲 和銅 霊亀 靈龜 養老 天平感宝 天平感寶 天平勝宝 天平勝寶 天平宝字 天平寶字 天平神護 神護景雲 宝亀 寶龜
天応 天應 延暦 延曆 弘仁 天長 嘉祥 斉衡 齊衡 元慶 仁和 寛平 寬平 昌泰 延喜 延長 応和 應和
康保 安和 天延 天元 永観 永觀 寛和 寬和 永延 永祚 正暦 正曆 長徳 長德 長保 寛弘 寬弘 長和
寛仁 寬仁 治安 万寿 萬壽 長元 長暦 長曆 長久 寛徳 寬德 永承 天喜 康平 治暦 治曆 延久 承保
承暦 承曆 永保 応徳 應德 寛治 寬治 嘉保 永長 承徳 承德 康和 長治 嘉承 天仁 天永 永久 元永
保安 天治 大治 天承 長承 保延 永治 康治 天養 久安 仁平 久寿 久壽 保元 平治 応保 應保 長寛
長寬 永万 永萬 仁安 嘉応 嘉應 安元 治承 養和 寿永 壽永 元暦 元曆 文治 建久 正治 建仁 元久
建永 承元 建暦 建曆 建保 承久 貞応 貞應 元仁 嘉禄 嘉祿 安貞 寛喜 寬喜 貞永 文暦 文曆 嘉禎
暦仁 曆仁 延応 延應 仁治 寛元 寬元 宝治 寶治 建長 康元 正嘉 文応 文應 弘長 文永 建治 弘安
正応 正應 永仁 正安 嘉元 徳治 德治 応長 應長 正和 文保 元応 元應 元亨 正中 嘉暦 嘉曆 正慶
元弘 延元 暦応 曆應 興国 興國 康永 貞和 観応 觀應 文和 延文 康安 貞治 応安 應安 文中 康暦
康曆 弘和 永徳 永德 元中 康応 康應 応永 應永 正長 永享 嘉吉 文安 宝徳 寶德 享徳 享德 康正
長禄 長祿 寛正 寬正 文正 応仁 應仁 長享 延徳 延德 明応 明應 文亀 文龜 永正 大永 享禄 享祿
天文 永禄 永祿 元亀 元龜 文禄 文祿 慶長 寛永 寬永 正保 慶安 承応 承應 明暦 明曆 万治 萬治
寛文 寬文 延宝 延寶 貞享 元禄 元祿 宝永 寶永 正徳 享保 元文 寛保 寬保 延享 寛延 寬延 明和
安永 天明 寛政 寬政 享和 文化 文政 弘化 嘉永 安政 万延 萬延 文久 元治 慶応 慶應 明治 大正
昭和 平成 令和
`.trim().split(/\s+/))
