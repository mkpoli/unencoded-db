-- Generated spellings are search keys. Only curated spellings label a title in the picker.
ALTER TABLE source_title_readings ADD COLUMN generated INTEGER NOT NULL DEFAULT 0 CHECK (generated IN (0, 1));
CREATE INDEX source_readings_by_title ON source_title_readings(title, generated, lookup);

-- Attested alternatives retain their catalogue spellings. A volume can share the work title.
INSERT INTO source_title_readings(title,lookup,spelling) VALUES
  -- https://ndlsearch.ndl.go.jp/books/R100000039-I904888
  ('まじなひ秘法 : 素人早わかり民間日用', 'まじないひほうしろうとはやわかりみんかんにちよう', 'マジナイ ヒホウ : シロウト ハヤワカリ ミンカン ニチヨウ'),
  -- https://ndlsearch.ndl.go.jp/books/R100000039-I2536012
  ('有用植物名彙', 'ゆうようしょくぶつめいい', 'ユウヨウショクブツメイイ'),
  -- https://ndlsearch.ndl.go.jp/books/R100000039-I1879503
  ('歴世女装考 : 4巻. 冬', 'れきせいじょそうこう', 'レキセイ ジョソウコウ'),
  -- https://ndlsearch.ndl.go.jp/books/R100000039-I2983759
  ('実用姓氏辞典', 'じつようせいしじてん', 'ジツヨウ セイシ ジテン'),
  -- https://ndlsearch.ndl.go.jp/books/R100000039-I1371411
  ('国民数表', 'こくみんすうひょう', 'コクミン スウヒョウ'),
  -- https://ndlsearch.ndl.go.jp/books/R100000039-I1081727
  ('[調劑表彙]', 'ちょうざいひょうい', 'チョウザイ ヒョウイ'),
  -- https://ndlsearch.ndl.go.jp/books/R100000039-I970485
  ('メートル法大観', 'めーとるほうたいかん', 'メートルホウ タイカン'),
  -- https://hannom.vass.gov.vn/nghien-cuu-van-ban/khao-sat-tai-lieu-han-nom-ve-du-dia-chi-hien-luu-giu-tai-vien-nghien-cuu-han-nom-so-3-94-2009-tr-11-28-506368
  ('大南一統志', 'đainamnhatthongchi', 'Đại Nam nhất thống chí'),
  -- https://hannom.vass.gov.vn/nghien-cuu-van-ban/khao-sat-tai-lieu-han-nom-ve-du-dia-chi-hien-luu-giu-tai-vien-nghien-cuu-han-nom-so-3-94-2009-tr-11-28-506368
  ('同慶地輿誌', 'đongkhanhđiaduchi', 'Đồng Khánh địa dư chí'),
  -- https://hannom.vass.gov.vn/nghien-cuu-van-ban/khao-sat-tai-lieu-han-nom-ve-du-dia-chi-hien-luu-giu-tai-vien-nghien-cuu-han-nom-so-3-94-2009-tr-11-28-506368
  ('嘉定城通志', 'giađinhthanhthongchi', 'Gia Định thành thông chí'),
  -- https://kyudb.snu.ac.kr/book/view.do?book_cd=GK13902_00
  ('純明妃國葬都監儀軌 第二冊', '순명비국장도감의궤', '순명비국장도감의궤'),
  -- https://kyudb.snu.ac.kr/book/view.do?book_cd=GK13269_00
  ('肅宗尊崇都監儀軌 第一冊', '숙종존숭도감의궤', '[숙종]존숭도감의궤'),
  -- https://www.nomfoundation.org/nom-tools/Nom-Books?uiLang=en
  ('Tự Điển Chữ Nôm Dẫn Giải', 'dictionaryofnomcharacterswithquotationsannotations', 'Dictionary of Nôm Characters with Quotations & Annotations'),
  -- https://www.unicode.org/L2/L2018/18281-viet-reading-mark-cmt.pdf
  ('Từ Điển Chữ Nôm Trích Dẫn', 'dictionaryofnomcharacterswithexcerpts', 'Dictionary of Nôm characters with excerpts'),
  -- https://jsg.aks.ac.kr/dir/view?dataId=LIB_198312
  ('宗廟改修都監儀軌', '종묘개수도감의궤', '종묘개수도감의궤'),
  -- https://kyudb.snu.ac.kr/book/text.do?book_cd=GK13579_00&vol_no=0001
  ('宣懿王后祔廟都監都廳儀軌', '선의왕후부묘도감도청의궤', '[선의왕후]부묘도감도청의궤'),
  -- https://www.gugak.go.kr/ency/topic/view/1341
  ('定本 與猶堂全書 樂書孤存 卷四', '악서고존', '악서고존'),
  -- https://kyudb.snu.ac.kr/book/text.do?book_cd=GK15082_00&vol_no=0002
  ('英祖戊申逆獄推案 第二冊', '영조무신역옥추안', '영조무신역옥추안'),
  -- https://kyudb.snu.ac.kr/book/list.do?book_cate=MGO0805&mid=MGO
  ('驛土所關査員質報存檔 第二冊', '역토소관사원질보존당', '역토소관사원질보존당'),
  -- https://ndlsearch.ndl.go.jp/books/R100000002-I000000669007
  ('大南一統志', 'だいなんいっとうし', 'ダイナン イットウシ'),
  -- https://hannom.nlv.gov.vn/hannom/cgi-bin/hannom?a=d&d=BNTwEHieafgVS1909
  ('五千字譯國語', 'nguthientudichquocngu', 'Ngũ thiên tự dịch quốc ngữ'),
  -- https://hannom.nlv.gov.vn/hannom/cgi-bin/hannom?a=d&d=CdjlbdgGlMICsuFg
  ('皇越文選', 'hoangvietvantuyen', 'Hoàng Việt văn tuyển'),
  -- https://hannom.nlv.gov.vn/hannom/cgi-bin/hannom?a=d&d=BNTwEHieafhzt
  ('大越史記全書（標點校勘本）第四冊', 'đaivietsukytoanthu', 'Đại Việt sử ký toàn thư'),
  -- https://kyudb.snu.ac.kr/book/view.do?book_cd=GK13283_00
  ('惠順慈敬獻烈大王大妃殿尊崇都監都廳儀軌', '혜순자경헌렬대왕대비전존숭도감도청의궤', '[혜순자경헌렬대왕대비전]존숭도감도청의궤'),
  -- In the recorded source title.
  ('周易鄭康成注 — Zhōuyì Zhèng Kāngchéng zhù, ‘Zhèng Kāngchéng’s commentary on the Changes’', 'zhouyizhengkangchengzhu', 'Zhōuyì Zhèng Kāngchéng zhù'),
  -- In the recorded source title.
  ('周易鄭康成注 — Zhōuyì Zhèng Kāngchéng zhù, ‘Zhèng Kāngchéng’s commentary on the Changes’', 'zhengkangchengscommentaryonthechanges', 'Zhèng Kāngchéng’s commentary on the Changes');
