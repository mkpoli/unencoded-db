-- Reviewed excerpts from captions, scans and cited works. IDs, revisions and source
-- identities tie the transcriptions to the audited version of each public record.
CREATE TABLE passage_records(entry_id INTEGER PRIMARY KEY, batch INTEGER, journal INTEGER, remove_terms TEXT, add_terms TEXT);
INSERT INTO passage_records VALUES
  (1, 1, 5028, '[]', '[]'),
  (4, 4, 15, '[]', '["w:噐"]'),
  (5, 5, 17, '[]', '[]'),
  (6, 4, 4384, '[]', '[]'),
  (7, 7, 5325, '[]', '[]'),
  (12, 12, 38, '[]', '["w:dialect"]'),
  (702, 702, 5930, '[]', '[]'),
  (1530, 1530, 5920, '[]', '[]'),
  (1546, 1546, 5779, '[]', '["w:見","w:第","w:3","w:頁","w:11","w:15"]'),
  (1549, 1549, 5783, '["w:jù","w:上","w:有","w:此"]', '["w:列","w:jü","w:方"]'),
  (1562, 1562, 5796, '["w:目","w:稱","w:親","w:詞"]', '["w:称","w:亲"]'),
  (1618, 1618, 5854, '["w:作"]', '[]'),
  (1684, 1684, 4921, '[]', '["w:metrology"]'),
  (1685, 1685, 4923, '[]', '["w:nom"]'),
  (1686, 1686, 5055, '["w:列"]', '["w:metrology"]'),
  (1696, 1696, 4957, '[]', '["w:transliteration"]'),
  (1697, 1697, 5886, '["w:餘"]', '["w:abbreviation","w:簽","w:為","w:余"]'),
  (1698, 1698, 5887, '["w:be","w:d","w:youtu"]', '[]'),
  (1699, 1699, 5888, '[]', '[]'),
  (1700, 1699, 5889, '[]', '["w:兩","w:則","w:貼","w:第","w:二"]'),
  (1711, 1711, 5900, '[]', '["w:metrology","w:形","w:見"]'),
  (1713, 1713, 5902, '["w:列","w:表"]', '[]'),
  (1717, 1717, 5906, '["w:等"]', '[]'),
  (1720, 1720, 5910, '[]', '["w:places"]'),
  (1721, 1721, 5911, '["w:niaǒ"]', '["w:niaǎo"]'),
  (1722, 1722, 5912, '["w:niaǒ"]', '["w:niaǎo"]'),
  (1723, 1723, 5913, '["w:niaǒ"]', '["w:為","w:niaǎo"]'),
  (1724, 1724, 5914, '[]', '[]'),
  (1725, 1725, 5915, '[]', '["w:穌"]'),
  (1730, 1730, 5027, '[]', '["w:貼","w:下","w:方"]'),
  (1735, 1735, 5092, '[]', '["w:places","w:flora","w:fauna","w:kokuji"]'),
  (1771, 1771, 5168, '[]', '[]'),
  (1779, 1779, 5189, '[]', '[]'),
  (1780, 1780, 5265, '[]', '[]'),
  (1781, 1781, 5193, '[]', '[]'),
  (1783, 1783, 5309, '["w:來","w:聞","w:這"]', '["w:来","w:闻","w:这"]'),
  (1784, 1784, 5310, '["w:中","w:所","w:見","w:諸","w:點"]', '["w:引","w:文","w:為","w:湖","w:州","w:叫"]'),
  (1785, 1785, 5311, '["w:所","w:見"]', '["w:溫","w:州","w:末","w:居"]'),
  (1786, 1786, 5312, '["w:中","w:所","w:見","w:諸","w:點"]', '["w:引","w:文","w:為","w:湖","w:州","w:二","w:末","w:得"]'),
  (1810, 1810, 5316, '[]', '["w:讀","w:引","w:文","w:一","w:義","w:虫","w:动","w:書","w:影"]'),
  (1811, 1811, 5317, '[]', '["w:頭","w:讀","w:書","w:影"]'),
  (1825, 1825, 5923, '[]', '["w:惟","w:貴","w:縣","w:繁","w:多","w:始","w:自","w:廣","w:東","w:福","w:建","w:江"]'),
  (1832, 1832, 5304, '["w:剛","w:剮"]', '["w:犀"]'),
  (1833, 1833, 5306, '["w:於","w:與","w:見"]', '["w:同","w:疑","w:作"]'),
  (1834, 1834, 5308, '["w:句","w:於","w:見"]', '[]'),
  (1835, 1835, 5321, '["w:二"]', '["w:首","w:字","w:舊","w:錄","w:作","w:兩","w:處","w:次","w:的","w:下","w:部","w:形","w:與","w:不","w:同","w:待","w:考"]'),
  (1836, 1836, 5323, '[]', '[]'),
  (1837, 1837, 5925, '[]', '[]'),
  (1838, 1838, 5927, '[]', '[]'),
  (1839, 1839, 5929, '[]', '[]'),
  (1840, 1840, 5932, '[]', '[]'),
  (1841, 1841, 5934, '[]', '[]'),
  (1842, 1842, 5936, '[]', '[]'),
  (1843, 1843, 5938, '[]', '[]'),
  (1844, 1844, 5940, '[]', '[]'),
  (1845, 1845, 5942, '[]', '["w:4"]');

CREATE TABLE passage_edits(sighting_id INTEGER PRIMARY KEY, entry_id INTEGER, rev INTEGER, source_id INTEGER, old_note TEXT, new_note TEXT, quotes TEXT);
INSERT INTO passage_edits VALUES
  (1, 1, 3, 3, NULL, NULL, '[{"text":"⿰彳ヱ（⿰彳卫、衛 畧字）","locator":null}]'),
  (4, 4, 1, 6, NULL, NULL, '[{"text":"どんな「器」見せてんだよ笑\nちなみにU外字です","locator":null}]'),
  (5, 5, 1, 7, '北海道新聞社『北の魚歳時記』' || char(13) || '' || char(10) || '' || char(13) || '' || char(10) || 'https://dl.ndl.go.jp/pid/12614929/1/102?keyword=%E9%AD%9A%E3%81%B8%E3%82%93%E3%81%AB%E5%B2%B8', '北海道新聞社『北の魚歳時記』' || char(13) || '' || char(10) || '' || char(13) || '' || char(10) || 'https://dl.ndl.go.jp/pid/12614929/1/102?keyword=%E9%AD%9A%E3%81%B8%E3%82%93%E3%81%AB%E5%B2%B8', '[{"text":"⿰魚岸（ししゃも）\n出典：北海道新聞社『北の魚歳時記』","locator":null}]'),
  (6, 6, 1, 6, NULL, NULL, '[{"text":"どんな「器」見せてんだよ笑\nちなみにU外字です","locator":null}]'),
  (7, 7, 1, 9, NULL, NULL, '[{"text":"めちゃ面白い。台北には、この漢字を使ってる「台灣(⿱入下)店」（Tâi-uân ê tiàm: 台湾の店）という名前の本屋さんがあります。","locator":null}]'),
  (10, 7, 1, 14, NULL, NULL, '[{"text":"鶯歌陶磁老街にある豆花の店名のこの字「上が\"入\"で下が\"下\"」の読みが「？」。\n「阿嬤ㄟ豆花」と書かれることもあるので「へ 」みたいなこの字は「えぃ 」に近い読み、意味は「…的 」、つまり「ばあちゃんの豆花 」ってこと。\n「入＋水 」だったら「ばあちゃんどんぶらこ豆花 」とユニークな店名に。","locator":null}]'),
  (11, 7, 1, 15, NULL, NULL, '[{"text":"台湾語の「の」に当たる字です。読みはおっしゃる通りエーで、アーマーエータウホエです。台湾e店という有名な書店もこの字を使っています。どんぶらこではありません…","locator":null}]'),
  (16, 12, 1, 24, NULL, NULL, '[{"text":"⿰生意 buns 義:販賣\n#漢字 #表意文字","locator":null}]'),
  (1565, 1546, 2, NULL, '用於人名：「洪軍⿰火寽，〈駕駛行為研究方法及實例研究〉，臺大土研所碩士論文，民國67年」。', '見參考文獻第3條人名。', '[{"text":"洪軍⿰火寽，「駕駛行為研究方法及實例研究」，臺大土研所碩士論文，民國67年，頁11-15。","locator":null}]'),
  (1569, 1549, 2, NULL, '招牌上此字旁標音「Jù」，下有「冬酒夏醋」四字。', '招牌字旁標音，下列四字。', '[{"text":"⿰氵醋　Jü","locator":"招牌"},{"text":"冬酒夏醋","locator":"招牌下方"}]'),
  (1582, 1562, 2, NULL, '詞目「⿱父拜⿱父拜」bāi·bai，方言，稱父親；另一圖標作地方字。', '另一圖標作地方字。', '[{"text":"【⿱父拜⿱父拜】bāi·bai　方言。称父亲。","locator":null}]'),
  (1640, 1618, 2, NULL, '文作「圣二〇⿰米厂」，發文者釋為「径二〇糎」。', '發文者釋為「径二〇糎」。', '[{"text":"圣二〇⿰米厂","locator":null}]'),
  (1746, 1684, 1, NULL, '「客室ノ床面積ハ乘客定員一人ニ付キ0.28𥹒以上トス」。', NULL, '[{"text":"客室ノ床面積ハ乘客定員一人ニ付キ0.28𥹒以上トス。","locator":null}]'),
  (1747, 1685, 1, NULL, '「沃𫰅陂r」記拉丁語 Octōber（十月），借𫰅之音 /tɔ/。發文者寫作𡚢，影像所見為𫰅。', '記拉丁語 Octōber（十月），借𫰅之音 /tɔ/。發文者寫作𡚢，影像所見為𫰅。', '[{"text":"沃𫰅陂r","locator":null}]'),
  (1748, 1686, 1, 2736, 'ポンド（pound）之漢字列「听・封度・封・英听・英斤・洋斤・封土」。', 'ポンド（pound）之漢字。', '[{"text":"听・封度・封・英听・英斤・洋斤・封土","locator":null}]'),
  (1769, 1696, 1, 2775, '略語表：「Gm, oder Gr,-( gramma ) 瓦⿰束立謨」。', '略語表。', '[{"text":"Gm, oder Gr,-( gramma ) 瓦⿰束立謨","locator":null}]'),
  (1770, 1697, 2, 2777, '「貴国5000有餘年⿸厂丶史」。信末署1982.11.7；展示說明作「1982年，顧客寫給陶陶居的信」。原貼文記作1984年。', '信末署1982.11.7。展簽說明為1982年顧客寫給陶陶居的信，原貼文記作1984年。', '[{"text":"1984年の偽中国語発見","locator":"貼文"},{"text":"貴国5000有余年⿸厂丶史","locator":"陶陶居展示的顧客來信"}]'),
  (1771, 1698, 2, 2779, '標題字「魔法童女」之「魔」作⿸广マ。', '標題字「魔法童女」之「魔」作⿸广マ。', '[{"text":"◤#まどかマギカ × #物語シリーズ コラボ◢\n\n8月28日（金）\n『劇場版 魔法少女まどか☆マギカ〈ワルプルギスの廻天〉』の公開を記念し、〈物語〉シリーズとのスペシャルコラボが実現！\n\n#西尾維新 先生書き下ろし\n『魔法童女よつぎ☆ピース』を公開！\n本日より4日連続で3話ずつ、\n全12話を順次公開いたします。\n\n◆第1話\n「夢の中で会った、だけのような……」","locator":null}]'),
  (1772, 1699, 2, 2781, NULL, NULL, '[{"text":"文字の解説まで、嬉しいね","locator":null}]'),
  (1773, 1700, 2, 2781, '告示：「山に漢字の弗で岪と読みます」「「岪」とは、方言で断崖・絶壁・急斜面・川岸などの険しい道」。各例中山多寫入弗的左上方。', '兩則告示。各例中山多寫入弗的左上方。', '[{"text":"文字の解説まで、嬉しいね","locator":"貼文"},{"text":"山に漢字の弗で岪と読みます。","locator":"第一則告示"},{"text":"「岪」とは、方言で断崖・絶壁・急斜面\n川岸などの険しい道","locator":"第二則告示"}]'),
  (1784, 1711, 2, 2796, '度量單位表「略字」欄：ミクロン ⿰米𣁋 u 百萬分の一米。', '度量單位表，字形見「略字」欄。', '[{"text":"ミクロン\t⿰米𣁋\tu\t百萬分の一米","locator":null}]'),
  (1786, 1713, 2, NULL, '表列：14、文、⿱亠斐、FCAC。發文者指出與登記統一文字TK01037450、GJ文字GJ000999同形。', '發文者指出與登記統一文字TK01037450、GJ文字GJ000999同形。', '[{"text":"14\t文\t⿱亠斐\tFCAC","locator":null}]'),
  (1790, 1717, 2, 2803, '圖42-4至42-6線名「列車到達綫」「客車留置綫」等。書名見同串貼文 https://x.com/ni9man10/status/1967106342130459027 。', '圖42-4至42-6線名。書名見同串貼文 https://x.com/ni9man10/status/1967106342130459027 。', '[{"text":"列車到達綫","locator":"圖中線名"},{"text":"客車留置綫","locator":"圖中線名"}]'),
  (1793, 1720, 2, 2808, '「〔足寄郡〕淕別村……陸別村（昭二四・八・一改称）」。', NULL, '[{"text":"〔足寄郡〕淕別村……陸別村（昭二四・八・一改称）","locator":null}]'),
  (1795, 1721, 2, 2812, '字頭。「⿱鳥⿰鳥鳥（⿱鸟⿰鸟鸟、⿱⿰鸟鸟鸟）（niaǒ）：同“鸟”，鸟名。」', '字頭。', '[{"text":"⿱鳥⿰鳥鳥（⿱鸟⿰鸟鸟、⿱⿰鸟鸟鸟）（niaǎo）：同“鸟”，鸟名。","locator":null}]'),
  (1796, 1722, 2, 2812, '字頭⿱鳥⿰鳥鳥的括注異體。「⿱鳥⿰鳥鳥（⿱鸟⿰鸟鸟、⿱⿰鸟鸟鸟）（niaǒ）：同“鸟”，鸟名。」', '字頭⿱鳥⿰鳥鳥的括注異體。', '[{"text":"⿱鳥⿰鳥鳥（⿱鸟⿰鸟鸟、⿱⿰鸟鸟鸟）（niaǎo）：同“鸟”，鸟名。","locator":null}]'),
  (1797, 1723, 2, 2812, '倒品字形；字頭⿱鳥⿰鳥鳥的括注異體。「⿱鳥⿰鳥鳥（⿱鸟⿰鸟鸟、⿱⿰鸟鸟鸟）（niaǒ）：同“鸟”，鸟名。」', '倒品字形，為字頭⿱鳥⿰鳥鳥的括注異體。', '[{"text":"⿱鳥⿰鳥鳥（⿱鸟⿰鸟鸟、⿱⿰鸟鸟鸟）（niaǎo）：同“鸟”，鸟名。","locator":null}]'),
  (1798, 1724, 2, 2812, '「⿰豊豊：体。」', NULL, '[{"text":"⿰豊豊：体。","locator":null}]'),
  (1799, 1725, 2, 2812, '「䲆：1.（sū）同“稣”。2.（xiān）同“鲜”。」', NULL, '[{"text":"䲆：1.（sū）同“穌”。2.（xiān）同“鲜”。","locator":null}]'),
  (1804, 1530, 2, 2826, '「化學家即以氫離子濃度或⿰离巠標值（pH值）來表示一溶液的酸鹼度」。', NULL, '[{"text":"化學家即以氫離子濃度或⿰离巠標值（pH值）來表示一溶液的酸鹼度。","locator":null}]'),
  (1805, 1730, 1, 2828, '「佑芽に適当に相⿰木⿱づちされたら不安になると思う」。', NULL, '[{"text":"佑芽だって人間だけど","locator":"貼文"},{"text":"佑芽に適当に相⿰木⿱づちされたら不安になると思う","locator":"插畫下方手寫文字"}]'),
  (1811, 1735, 2, 2838, NULL, NULL, '[{"text":"三重といえば、志摩市浜島町磯笛岬で「魚翼(つばす)」という独特の漢字が見られる。紙資料ではこの漢字をまだ確認していないが、今度の県史には載っているだろうか。\n\n三重）編纂35年、終幕　「三重県史」が完成","locator":null}]'),
  (1848, 1771, 1, 2846, NULL, NULL, '[{"text":"2024〜2025年に記録した漢字でスマホに入ってるものを一挙放出","locator":null}]'),
  (1857, 1779, 1, 2855, NULL, NULL, '[{"text":"성씨/밥그릇 노 또한 한글을 이용한 국자(國字)이지요. 한국에서는 국내에서만 사용되는 한자 약자/이체를 국자(國字)라고 부릅니다.","locator":null}]'),
  (1858, 1780, 1, 2856, '《英祖戊申逆狱推案》『戊申逆狱推案二』戊申三月二十八日：「若問於柳儉之兄▼(亻+심)在淸凉橋者，則可知其計。」', '《英祖戊申逆狱推案》『戊申逆狱推案二』戊申三月二十八日。', '[{"text":"若問於柳儉之兄⿰亻심在淸凉橋者則可知其計","locator":null}]'),
  (1859, 1781, 1, 2858, '《驛土所關査員質報存》II『홍주부 관하 7개 군 각 역전답의 改量降等과 임천 등 7개 군의 역토 양안수정 등을 보고』：「徐㪳屈金。」', '《驛土所關査員質報存》II『홍주부 관하 7개 군 각 역전답의 改量降等과 임천 등 7개 군의 역토 양안수정 등을 보고』。', '[{"text":"徐㪳屈金","locator":null}]'),
  (1861, 1783, 2, 2930, '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表第23題「來聞聞這朵花香不香」諸方言點例句中所見。', '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表第23題，諸方言點例句中所見。', '[{"text":"来闻闻这朵花香不香。","locator":null}]'),
  (1862, 1784, 2, 2930, '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表第17題「慢慢兒地吃，不要急」諸方言點例句中所見。', '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表第17題「慢慢兒地吃，不要急」。引文為湖州例句。', '[{"text":"慢慢叫吃，⿰不要急。","locator":null}]'),
  (1863, 1785, 2, 2930, '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表中所見；書中「房子」吳語作「屋宕」。', '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表，溫州例句末。書中「房子」吳語作「屋宕」。', '[{"text":"居⿰屋宕","locator":null}]'),
  (1864, 1786, 2, 2930, '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表第44題「他不知道」諸方言點例句中所見。', '《浙江通志·方言志》（浙江人民出版社，2017）第五章語法例句對照表第44題「他不知道」。引文為湖州第二例句末。', '[{"text":"⿰弗晓得。","locator":null}]'),
  (1888, 1810, 2, 2944, '方言詞典第208頁⿱入身條：nuàn，小蟲等在人身上蠕動；標為方言字。', '方言詞典第208頁⿱入身條，讀 nuàn，標為方言字。引文為第一義。', '[{"text":"小虫等在人身上蠕动","locator":"字典書影，第208頁"}]'),
  (1889, 1811, 2, 2945, '附錄二古字表第116條：⿰目凹 tag⁴，目[⿰目凹][⿰目凹]，眼睛陷下去。', '附錄二古字表第116條，字頭⿰目凹，讀 tag⁴。', '[{"text":"目⿰目凹⿰目凹：眼睛陷下去。","locator":"字表書影，第116條"}]'),
  (1903, 1825, 2, 2910, '「猍人」條：「猍人潯境四屬皆有……西遷來者故曰來」。', '「猍人」條。', '[{"text":"猍人潯境四屬皆有惟貴縣繁多始自廣東福建江西遷來者故曰來","locator":null}]'),
  (1910, 1832, 1, 2912, '上編「俗字研究」：「凌」之俗字，引《童蒙雜字》（續·十四册）435頁「⿰夌刂剛細剮」。', '上編「俗字研究」：「凌」之俗字。引《童蒙雜字》（續·十四册）435頁。', '[{"text":"⿰夌刂⿰犀刂細","locator":"《童蒙雜字》引文"}]'),
  (1911, 1833, 1, 2926, '刻本《三言雜字》（版心題名）書影，圖片帶孔夫子舊書網浮水印；見於「與⿱髟衣⿱髟青」句，上字未能確認。', '刻本《三言雜字》（版心題名）書影，圖片帶孔夫子舊書網浮水印；同句上字疑作⿱髟衣，未能確認。', '[{"text":"⿱髟青","locator":null}]'),
  (1912, 1834, 1, 2926, '刻本《三言雜字》（版心題名）書影，圖片帶孔夫子舊書網浮水印；見於「攢⿰飠角包」句。', '刻本《三言雜字》（版心題名）書影，圖片帶孔夫子舊書網浮水印。', '[{"text":"攢⿰飠角包","locator":null}]'),
  (1913, 1835, 1, 1698, '民族名稱表華坪、永仁二欄：「⿱此立⿱此力扒」「⿱此力⿱此力」。', '民族名稱表永仁欄首字。華坪欄舊錄作「⿱此立⿱此力扒」，永仁欄舊錄作「⿱此力⿱此力」。兩處次字的下部字形與永仁首字不同，待考。', '[{"text":"⿱此力","locator":"永仁欄"}]'),
  (1914, 1836, 1, 2951, '箴言 7:11「姖一溜裡放蕩毋知見笑」，7:26「姖已經使好多人橫倒，有盡多男人被姖害死」。', NULL, '[{"text":"姖一溜裡放蕩毋知見笑，","locator":"箴言 7:11"},{"text":"姖已經使好多人橫倒，\n有盡多男人被姖害死。","locator":"箴言 7:26"}]'),
  (1915, 1837, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语通用09：义项「圣」，对音汉字「惟」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"圣","locator":"庆远土司译语 通用09 · 义项"},{"text":"惟","locator":"庆远土司译语 通用09 · 对音汉字"}]'),
  (1916, 1838, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语通用10：义项「主」，对音汉字「蘇」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"主","locator":"庆远土司译语 通用10 · 义项"},{"text":"蘇","locator":"庆远土司译语 通用10 · 对音汉字"}]'),
  (1917, 1839, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语通用11：义项「道」，对音汉字「斗」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"道","locator":"庆远土司译语 通用11 · 义项"},{"text":"斗","locator":"庆远土司译语 通用11 · 对音汉字"}]'),
  (1918, 702, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语通用14：义项「流」，对音汉字「壘」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"流","locator":"庆远土司译语 通用14 · 义项"},{"text":"壘","locator":"庆远土司译语 通用14 · 对音汉字"}]'),
  (1919, 1840, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语杂项12：义项「泰」，对音汉字「台」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"泰","locator":"庆远土司译语 杂项12 · 义项"},{"text":"台","locator":"庆远土司译语 杂项12 · 对音汉字"}]'),
  (1920, 1841, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语杂项13：义项「万」，对音汉字「凡」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"万","locator":"庆远土司译语 杂项13 · 义项"},{"text":"凡","locator":"庆远土司译语 杂项13 · 对音汉字"}]'),
  (1921, 1842, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语杂项14：义项「寿」，对音汉字「九」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"寿","locator":"庆远土司译语 杂项14 · 义项"},{"text":"九","locator":"庆远土司译语 杂项14 · 对音汉字"}]'),
  (1922, 1843, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语杂项16：义项「秋」，对音汉字「収」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"秋","locator":"庆远土司译语 杂项16 · 义项"},{"text":"収","locator":"庆远土司译语 杂项16 · 对音汉字"}]'),
  (1923, 1844, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语杂项31：义项「龙」，对音汉字「額」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"龙","locator":"庆远土司译语 杂项31 · 义项"},{"text":"額","locator":"庆远土司译语 杂项31 · 对音汉字"}]'),
  (1924, 1845, 1, 2952, '附录三「清代太平、庆远、镇安土司译语对照表」庆远土司译语杂项32：义项「游」，对音汉字「有」。书名据书眉，左端在图外。', '附录三「清代太平、庆远、镇安土司译语对照表」。书名据书眉，左端在图外。', '[{"text":"游④","locator":"庆远土司译语 杂项32 · 义项"},{"text":"有","locator":"庆远土司译语 杂项32 · 对音汉字"}]');

CREATE TABLE caption_titles(source_id INTEGER PRIMARY KEY, batch INTEGER, old_hash TEXT, new_hash TEXT, name_key TEXT, alias_key TEXT);
INSERT INTO caption_titles VALUES
  (3, 1, 'a8a6544f714867fa521acbbcb2d49eee64a96827f64089cedb47c2dc68dfa758', '5f86cccf5eff134115cb40d143038b9983986f03486fb9828a7c4c696669891b', 'x.com/mkpoli/status/2119010548327334386', '⿰彳ヱ(⿰彳卫、衛 畧字)'),
  (6, 4, '4f3e99387acb0ebccdcd05919a6a9e94a4e074e02f765efb87674d8bb194f146', '7c072c9af815d278bd24a57b3f592ad9189b2fd38e991792c262b7e06602943c', 'x.com/utetamutete/status/2119717540968738934', 'どんな「器」見せてんだよ笑 ちなみにu外字です'),
  (7, 5, 'bd8d692ada99e2801d2bfd6e2fae892a20509b998588599a0b99e135f570762e', '405bac0e3907da5c6fb7eb2e6a4fc9d60641803e9f47f757f1677b223eb4693f', 'x.com/rion_amia/status/2120793844577194187', '⿰魚岸(ししゃも) 出典:北海道新聞社『北の魚歳時記』'),
  (9, 7, '8bf553dd25d946c555587ae190c8bfc26d7c3c74695a8ac09f1fef612a1eab07', 'c5889db3cd1b82a64e47341fbaa284da4c7643bd1b8c3dfb96864313c203944b', 'x.com/egasmb/status/1867606521657389369', 'めちゃ面白い。台北には、この漢字を使ってる「台灣(⿱入下)店」(tâi-uân ê tiàm: 台湾の店)という名前の本屋さんがあります。'),
  (14, 7, '063f628f68272b04fe9c9ce977a985640c74fa105bde80da0545faa37cf2a240', 'de8dac22c1c0a1b56d01454b0b0ebe48adada7f22eb50ba739b526e675e17d03', 'x.com/beywaku/status/2097845793248186531', '鶯歌陶磁老街にある豆花の店名のこの字「上が"入"で下が"下"」の読みが「?」。 「阿嬤ㄟ豆花」と書かれることもあるので「へ 」みたいなこの字は「えぃ 」に近い読み、意味は「...的 」、つまり「ばあちゃんの豆花 」ってこと。 「入+水 」だったら「ばあちゃんどんぶらこ豆花 」とユニークな店名に。'),
  (15, 7, '2ae55a6314492c88045f65fbb54937269efffd1bde6614f5fcbce29773933fee', 'fc59b73c36a8e3dbc36cb0b1d6330f94eb3d584ca617b0d2d6735b9896b24222', 'x.com/hima_nandane/status/2097904410294948240', '台湾語の「の」に当たる字です。読みはおっしゃる通りエーで、アーマーエータウホエです。台湾e店という有名な書店もこの字を使っています。どんぶらこではありません...'),
  (24, 12, '80ceb44dd2c5f318af8f9c0f07ba607015d6bd2c4af7e603a26689bdf2285ad1', 'df197bd663216a5d21ee338dc4e746765b3231b597bc5b088f3d27c5633daf6b', 'x.com/linanningnew/status/2120920392902881662/', '⿰生意 buns 義:販賣 #漢字 #表意文字'),
  (2777, 1697, 'a3b3c34b2b01021933ace87e6e2c1f43dbe13e4b246310205fc8d07136f04da4', '61a155258b315ccf21adc8b48c7df27295136f8a358e35f7ebc4264e0ff0cf13', 'x.com/dyhgy0819/status/2099830226905886830', '1984年の偽中国語発見'),
  (2779, 1698, 'dfe0be79be38117d0525ffb0ad3e219f798b0881969f91ebf11e7313bbb03ad5', '43ff96dbc4332dc29d44a9195da0e48585c1219cd98120ff8636d526826a2b2e', 'x.com/nisioisin_anime/status/2090379137827623404', '◤#まどかマギカ × #物語シリーズ コラボ◢ 8月28日(金) 『劇場版 魔法少女まどか☆マギカ〈ワルプルギスの廻天〉』の公開を記念し、〈物語〉シリーズとのスペシャルコラボが実現! #西尾維新 先生書き下ろし 『魔法童女よつぎ☆ピース』を公開! 本日より4日連続で3話ずつ、 全12話を順次公開いたします。 ◆第1話 「夢の中で会った、だけのような......」 https://youtu.be/d'),
  (2781, 1699, '7ec3b94ff4c98ef78b6cf6c90dd42d4aaa30b4550a2c2d9a552a11c44d4e1071', '92440493c75420be12f7eeefebba51c9bd1fb73c5be0551bfc2ffd64df4e6f5d', 'x.com/miya11133682/status/1966770505249443981', '文字の解説まで、嬉しいね'),
  (2828, 1730, 'f3cb6f695f62c0ca0febe0cf95b1ae49f5536975910aeb901e6b40780e512949', 'a059c5a5503f2017086479c6bcab90b6e16dd21df60ce4a5437fa5406a0ee950', 'x.com/vananatamago/status/2121567610454286598', '佑芽だって人間だけど'),
  (2838, 1735, 'f614f310642c855f648b1a6fb8d15c2acddd127520a859790e72a11cf15a2e5a', '4d7300edf8c83bae6627469cdc113369792f78f8866e3733acfe7f8d71fa6cf6', 'x.com/jumanjikyo/status/1262363956422696966', '三重といえば、志摩市浜島町磯笛岬で「魚翼(つばす)」という独特の漢字が見られる。紙資料ではこの漢字をまだ確認していないが、今度の県史には載っているだろうか。 三重)編纂35年、終幕 「三重県史」が完成'),
  (2846, 1771, 'b4b4f03821e4b908b9648a7fbbcbfccb03d6af38485188fe372c14982a70ab4c', '280dd30623ca68fdb6a4b0f9cd37d00efaed0d5058a4c7759abaa600930d2009', 'x.com/aa__iueohnn/status/2121611407469015106', '2024〜2025年に記録した漢字でスマホに入ってるものを一挙放出'),
  (2855, 1779, '2658949a97018bb0ff4f81d76a55ebcc685a55be0bd0076ae3a84904ac06ba68', 'a16de076db1f48c4f36fe076a5b2ef385b151ba23b48eef185875c275a6ae990', 'x.com/ponchak_mania/status/2046116465171104250', '성씨/밥그릇 노 또한 한글을 이용한 국자(國字)이지요. 한국에서는 국내에서만 사용되는 한자 약자/이체를 국자(國字)라고 부릅니다.');

-- An edit, hide, merge or new use of a shared caption leaves the affected group
-- for later review. Independent groups can still be corrected.
CREATE TABLE skipped_passages(batch INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO skipped_passages
SELECT p.batch FROM passage_records p WHERE p.journal IS NOT (SELECT max(id) FROM revisions WHERE entry_id = p.entry_id)
UNION SELECT p.batch FROM passage_edits a JOIN passage_records p ON p.entry_id = a.entry_id
WHERE NOT EXISTS (SELECT 1 FROM sightings s JOIN entries e ON e.id = s.entry_id
  WHERE s.id = a.sighting_id AND s.entry_id = a.entry_id AND s.rev = a.rev AND s.source_id IS a.source_id
    AND s.note IS a.old_note AND s.quotes IS NULL AND s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL)
UNION SELECT c.batch FROM caption_titles c
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE id = c.source_id AND hash = c.old_hash AND title IS NOT NULL)
   OR EXISTS (SELECT 1 FROM sources WHERE hash = c.new_hash)
   OR EXISTS (SELECT 1 FROM sighting_vias WHERE source_id = c.source_id)
   OR EXISTS (SELECT 1 FROM sightings s WHERE s.source_id = c.source_id
       AND NOT EXISTS (SELECT 1 FROM passage_edits a WHERE a.sighting_id = s.id AND a.source_id = s.source_id));
DELETE FROM passage_records WHERE batch IN (SELECT batch FROM skipped_passages);
DELETE FROM caption_titles WHERE batch IN (SELECT batch FROM skipped_passages);
DELETE FROM passage_edits WHERE entry_id NOT IN (SELECT entry_id FROM passage_records);

INSERT INTO source_aliases(source_id, lookup, spelling)
  SELECT s.id, c.alias_key, s.title FROM sources s JOIN caption_titles c ON c.source_id = s.id
  WHERE true ON CONFLICT(source_id, lookup) DO NOTHING;
UPDATE sources AS s SET hash = c.new_hash, name_lookup = c.name_key, title = NULL
  FROM caption_titles c WHERE s.id = c.source_id;
UPDATE sightings AS s SET quotes = a.quotes, note = a.new_note FROM passage_edits a WHERE s.id = a.sighting_id;
DELETE FROM entry_tags WHERE (entry_id, tag) IN (
  SELECT a.entry_id, j.value FROM passage_records a, json_each(a.remove_terms) j);
INSERT OR IGNORE INTO entry_tags(entry_id, tag, sightings, year)
  SELECT a.entry_id, j.value, 0, NULL FROM passage_records a, json_each(a.add_terms) j;

-- Append ordinary restorable sighting revisions; the old snapshots stay intact.
CREATE TABLE quote_editor (actor TEXT PRIMARY KEY, at TEXT);
INSERT INTO quote_editor SELECT lower(hex(randomblob(6))), strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE EXISTS (SELECT 1 FROM passage_edits);
INSERT INTO people(id, name, created_at) SELECT actor, 'Catalogue maintenance', at FROM quote_editor;
INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, summary, actor, at)
SELECT s.entry_id, s.id, 'sighting_edit', s.rev + 1,
  json_object('place', s.place, 'url', c.url, 'title', c.title, 'author', c.author,
    'publisher', c.publisher, 'report_date', c.report_date, 'original_date', s.original_date,
    'page', s.page, 'context', s.context, 'style', s.style, 'types', s.types, 'note', s.note, 'quotes', s.quotes,
    'vias', json((SELECT json_group_array(json_object('url', url, 'title', title, 'author', author,
       'publisher', publisher, 'report_date', report_date, 'quote', quote)) FROM
       (SELECT vc.*, v.quote FROM sighting_vias v JOIN sources vc ON vc.id = v.source_id
          WHERE v.sighting_id = s.id ORDER BY v.position))),
    'media', json((SELECT json_group_array(json_object('image_key',image_key,'image_type',image_type,
       'image_w',image_w,'image_h',image_h,'thumb_key',thumb_key,'box',box)) FROM
       (SELECT * FROM sighting_media WHERE sighting_id = s.id ORDER BY position)))),
  'Recover quotations from the cited source', editor.actor, editor.at
FROM passage_edits q JOIN sightings s ON s.id = q.sighting_id LEFT JOIN sources c ON c.id = s.source_id CROSS JOIN quote_editor editor;
UPDATE sightings SET rev = rev + 1, updated_at = (SELECT at FROM quote_editor) WHERE id IN (SELECT sighting_id FROM passage_edits);
UPDATE entries SET updated_at = (SELECT at FROM quote_editor) WHERE id IN (
  SELECT s.entry_id FROM passage_edits q JOIN sightings s ON s.id = q.sighting_id
);
DROP TABLE quote_editor;
DROP TABLE skipped_passages;
DROP TABLE caption_titles;
DROP TABLE passage_edits;
DROP TABLE passage_records;
