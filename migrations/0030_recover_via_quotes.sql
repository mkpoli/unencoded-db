-- Recover the post or message text on the particular sightings that cited it.
-- Each reviewed title is identified by its five-field citation hash. The other
-- hash is for the same citation with a NULL title. Keep its public source ID.
-- Columns after the hashes are the new display-name key, a Unicode alias-key
-- override for SQLite lower(), and the audited sighting IDs.
CREATE TABLE quote_titles (
  source_id INTEGER PRIMARY KEY, old_hash TEXT, new_hash TEXT, new_lookup TEXT,
  alias_key TEXT, members TEXT
);
INSERT INTO quote_titles VALUES
  (11, 'de38587307d19a1a128063b0ea2ac7d36648d9f738ea2f9f75a048d573620d93', 'a086b473263636c26469e91eaf9ab3242869a49bb397d942066e472e444d0bf6', 'x.com/jumanjikyo/status/1867190364773519512', NULL, '[8]'),
  (13, '1c8adaeda1d05d2af7721f03827545a6409928b8415b73565145288e96b8db5f', '92bf4d1cea8c23644c0cc44ef93c201792f3fd8375e673fa45175d0b95a5efc6', 'x.com/jumanjikyo/status/2100457979640529223', 'この字は台湾の作家である楊青矗氏の造字だと言われています。彼は漢字で書けない台湾語に150以上の新しい漢字を造り、自分で書いた字書に載せました。150もある新しい漢字はほとんど広まっていませんがこの「入下」だけは台湾でも見かけますね。 楊青矗『国台双語辞典』より', '[9]'),
  (17, '7aaec85bebb512ae147cce76d78a1c97f7a35540ceffdc10e709c01567f00e72', '043965083d73efa4c53addd86ea350aaaf22378a455d3ed59d67b1e6b8db9cf3', 'x.com/jumanjikyo/status/1918999385880285496', NULL, '[12,14]'),
  (19, 'e8aafb7b230d80be2548dc18a918dcd2d9a05d75b11e61d69006932b8497ba2b', '3cbef363db9ab3c0cf0f5af53cc40071b61d331ac7c66c57bbe58fed5f31f5bd', 'x.com/jumanjikyo/status/1918999385880285496', NULL, '[13,15]'),
  (25, '806306287b2caeec59111542d74e745811ebf195bb8c9ec29c378aa072d8cbaa', 'c2d896bf7655c393d44b6434e2b37e816a676014548412f032c7e5ce05f7c51f', '晚風', '大佬们,请问 骨聂 这个字怎么打出来?', '[17]'),
  (36, '3a5754e268e8f88ed9d4ffaa7b53c58e4b4c7915427b7366e7b913c763c623a9', 'f9c4e5c79475ae3807a399db8fb1f828321e3f69ab3be5b6f1942227b4d74d98', 'x.com/gyankotsu/status/1932145271581839765', NULL, '[24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202]'),
  (394, 'a227c3c270193ec398e39584721dd7944f81f9da7c0573b1bf7296942aeb51ac', '78674878d0d86b0b5c6a239b889e9cd69143738805cea790444b1eb187580f22', 'x.com/zoenshiueh_lieu/status/1916119021583282641', NULL, '[203,204,210,211,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,234,235,236,237,238,239,240,241,242,243,244,245,246,249,250,251,252,253,254,255,257,260,261,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,282,283,284,285,286,287,288,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,313,314,315,316,317,318,319,320,321,322,323,324,325,326,327,328,329,330,331,332,334,335,336,337,338,340,341,349,350,354,355,356,357,358,359,360,361,362,363,366,367,368,369,370,371,372,373,374,375,376,377,378,379,380,381,382,383,384,385,386,387,388,389,390,391,392,393,394,395,396,397,398,399,400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,419,420]'),
  (1933, 'cc4537bdbbc2e2c634ef36f401e7c4e71f693ef6c7f3ae50ce368610a6a3b993', 'a573478e78ff7b4cda3c6f557a6826836613d770af8e5d7eed604c457d0f7159', 'x.com/zoenshiueh_lieu/status/1916119848817725871', NULL, '[342,343,344,345,346,351]'),
  (1945, 'd9206e959c80e8188f5ddcded15ce97d0110353e7097e676f1a2b1e7ef5ff2fc', '72f7e24fe861d0d4b3a12bdc70ed4a348dec559b5b83774f12b12757a8db38a9', 'x.com/zoenshiueh_lieu/status/1916120736651219164', NULL, '[281,309,310,311,312,347,348]'),
  (1959, 'ee7d0d6f4403bffc31aeea2ed78ddd58d1fbdc809e2e771e6b91f312f2f67ab2', 'aa286689b0bfc339ed61a959a04ec52c3a83f078c90a23f3e16fd2c97820a18f', 'x.com/zoenshiueh_lieu/status/1916120946035065036', NULL, '[247,248]'),
  (1963, 'af09fd87f2bf0fef3a1b6c8d7555ebfe6f6f654066fa466c269e38a010cd0314', '19c8f5a070a40e46e75db6f8b25a468a63fca0b5b589d8379ba7abeab9d63bf2', 'x.com/zoenshiueh_lieu/status/1923668758176072105', NULL, '[212,289,290,291]'),
  (1971, 'faf58669c77fbf52a0adb06edc0eb8a7a5b7cde7b9a75fe7ff13f795806d43e0', '74246278c12de3c8c78a746e5db6fc28d9430c3121f74c20bea4e0e6da418847', 'x.com/zoenshiueh_lieu/status/1923670146834628975', NULL, '[205,206,207,208]'),
  (1979, '3b65a32edb8acea512eae3a7b0a92a1e4c3c975337875a6860ff4ae679a6791f', 'c31fa89945b33a3321366dfbc81cf645326c9f61f3a24192b13d94bb736b5e1b', 'x.com/zoenshiueh_lieu/status/1923670644786594004', NULL, '[353]'),
  (1981, '4a1bcfc8b196d905d0fe1d16cb1ac1923da123eed9aa318ef737e34df6cf6045', 'bafde86a53d78165c4537a2e2091b280d65053bdc3879b7a08645b5c68af2a4e', 'x.com/zoenshiueh_lieu/status/1923672067196715218', NULL, '[209,233,339,352]'),
  (1989, 'ec009e1fed0e6babfd9b5583d6529c0c48c92df5cea3fd88c443c92e007d2357', 'ff6f3c9ed7e3d1898e1fbc4dcce209949742515aa5c62650866eb72d8e0a1091', 'x.com/zoenshiueh_lieu/status/1923676200020709768', NULL, '[213,214,215,333]'),
  (1997, 'ad5f0f2edf3e4e45326dc2108588e3c8ef44844838701c8526c87f5a2990518a', '4e2d99e90ae31cfd69a079c1f4f67aab05eb08de98b2045d6dd5413da694855c', 'x.com/zoenshiueh_lieu/status/1923677215843287431', NULL, '[364,365]'),
  (2001, 'a01f17d095ed3843580f27ca00c9e3330a4687b6468da801441841ca0aa15cf5', 'ea24a8928d0419a80a17ad0cae0bdbee2227a70d9eb7732d7c207c4084db8f53', 'x.com/zoenshiueh_lieu/status/1923669080416059473', NULL, '[1512]'),
  (2003, '21a16297fde2a2b7e3d00a48578ade3a93792cca2afaf055150353c2b37c560e', 'df996be8f818bb024abe87bfa5eb876f5afda02fbabdc3c2bdc59019bfb9aa4b', 'x.com/zoenshiueh_lieu/status/2040668786555253025', 'read.nlc.cn/outopenbook/openobjectbook?aid=416&bid=62260.0 ⿺巴力', '[1513,1532]'),
  (2005, 'eaefb413e4e0ee268be1111cb4eed51a0bf2e7139763ff8fdd7afe1023d551fb', '6ec331810139119b594a97fa26b9a0b719cb2e98a8c7ccee6c2e8d16aa0b4ca1', 'x.com/zoenshiueh_lieu/status/2040659102746222628', 'upload.wikimedia.org/wikipedia/commons/4/4b/nlc416-08jh009205-40050_%e5%a4%a7%e6%95%b8%e5%b0%8f%e6%95%b8%e5%91%bd%e5%90%8d%e6%a8%99%e6%ba%96%e7%a0%94%e7%a9%b6%e6%84%8f%e8%a6%8b%e6%9b%b8.pdf ⿱立分 ⿰亞少 ⿰亞矣 ⿰亞莫 ⿰亞𢼸 ⿰亞糸 ⿰公亨', '[1514,1515,1516,1517,1518,1519,1520]'),
  (2019, 'c3a1c7baf80fa6e722d5c2b0605de3d7c978f82ec2cdf56fcb910f60a3925388', 'e5a7305c68a0e5ae1aa6107ed31e1311478b2d9e5432280ea1cec2d607aaf649', 'x.com/zoenshiueh_lieu/status/2038794332074045683', 'commons.wikimedia.org/wiki/file:nlc416-08jh010002-17601_%e5%ba%a6%e9%87%8f%e8%a1%a1%e5%95%8f%e9%a1%8c.pdf ⿺乚安 ⿺辶安', '[1521,1522]'),
  (2023, '606bf55b7054355f30d8937bf5b554815132feaae0eb28985381e47e7c1a72b8', 'd8740060e4678d1630f97fbb26e86a5b5d114dc962749e3b4f7e3150678fddac', 'x.com/zoenshiueh_lieu/status/2038793260056133655', 'wulixb.iphy.ac.cn/article/1950/5 ⿱十万', '[1523]'),
  (2025, 'd7a112bc52b3bd0ebf446886ac3a0076cdbfe782569cfb7f59ae96a917c4c866', 'a4cef27a8ec85d7e660a51ed2344fdf7ff464f0e83988ef35c90f67e8b2e2e2f', 'x.com/zoenshiueh_lieu/status/1959620041449804044', NULL, '[1524]'),
  (2027, '5dc56769a0e72a85cf9d8ff444b3dd3ec0c5eb9d0c0fdeb0e6c924108e829a20', '5aadcb08deb70020ad774b5b73b40e6164f3d8c54617f3007d660af3185e7b54', 'x.com/zoenshiueh_lieu/status/1948207916890402984', 'upload.wikimedia.org/wikipedia/commons/b/b5/nlc416-14jh005564-71313_%e4%b8%ad%e7%ad%89%e7%ae%97%e8%a1%93%e6%95%99%e7%a7%91%e6%9b%b8.pdf ⿰忄厘 ⿰亻畝 ⿰斗口 ⿱乂十 ⿱乂百 ⿱乂千 ⿱乂萬', '[1525,1526,1527,1528,1529,1530,1531]'),
  (2045, '8a7924bc91dfbc95766e213ca35baabff2133a9f0a408a884b1267d579344c6d', '58c527f579ee64d85de13a53b5ceb040946dc6fbff5cc9834f3f6c6513a02315', 'x.com/zoenshiueh_lieu/status/2054746018873479205', NULL, '[1510]'),
  (2049, '1e64cfa1bc1739cf2874dfbd0e051bd82f49da8145f95a4c73e8529ee19ec3aa', '3843ccc307a3041bd5196add44b730552c2bab1e1cc55cc325ce0b33c3de7867', 'x.com/zoenshiueh_lieu/status/1928699522995146976', 'upload.wikimedia.org/wikipedia/commons/1/18/ncl-9910007704_%e7%b2%b5%e6%b1%9f%e6%b5%81%e5%9f%9f%e4%ba%ba%e6%b0%91%e5%8f%b2.pdf ⿰彳農 ⿰彳良 ⿰彳沙 ⿰彳果 ⿰彳羅', '[1536,1537,1538,1539,1540]'),
  (2059, 'e245b077fab81738e1d284c820776b56c4cee2477d91976d411eeffff75e9a32', '850fed341592d25117aa0bd2407ab56c8a93e32bc8b9b8d4dbdd70957178db66', 'x.com/zoenshiueh_lieu/status/1928695950546997542', 'upload.wikimedia.org/wikipedia/commons/8/84/ssid-10382434_%e6%b3%b0%e6%97%8f%e5%be%b8%e6%97%8f%e7%b2%b5%e6%97%8f%e8%80%83.pdf ⿰彳老', '[1541]'),
  (2419, 'c9fdef362925f851fc71dc28c82e644d1c0b004089972d6cde5c3ef8a44af8ba', '46c8b81efaa6760605ff3020328dcaf870b9b2f2d98d858f5b4ab5fbdf2443c7', 'x.com/zoenshiueh_lieu/status/1916110542781223008', 'upload.wikimedia.org/wikipedia/commons/8/84/nlc404-01j000670-13256_%e5%b7%a5%e6%a5%ad%e6%a8%99%e6%ba%96%e8%88%87%e5%ba%a6%e9%87%8f%e8%a1%a1_1935%e5%b9%b42%e5%8d%b75%e6%9c%9f.pdf ⿰口办 ⿰口冕', '[258,259]'),
  (2423, '3b2ec5f2235a4e38df88c1e4668b7c3f238a0960104ab7f785d6a1b73e28c79f', 'c2abbb001da8cd9c02fcc630cf174ff0f9ed63df2f6a28d13c5daab300dac5d0', 'x.com/zoenshiueh_lieu/status/1927364562224853207', 'upload.wikimedia.org/wikipedia/commons/6/63/nlpi-31120003411112_%e5%90%84%e5%9c%8b%e6%ac%8a%e5%ba%a6.pdf ⿰口擔', '[262]'),
  (2425, 'b30fe2ad19ea4d6289fcd0767f412ef8aa75aa07adcce71cbac142e5fd836ce6', '7ee29e81b3ba5159f334641c3ce5e5d14d7c0df74cecb3f4642b8b3c79420240', 'x.com/zoenshiueh_lieu/status/1928811629627555891', 'upload.wikimedia.org/wikipedia/commons/6/6a/nlc403-312001068493-19603_%e8%b6%8a%e5%8d%97%e5%9c%b0%e8%bc%bf%e5%9c%96%e8%aa%aa_%e5%8d%b7%e4%b8%83.pdf ⿱𥫗妒 ⿰木兢', '[1542,1543]'),
  (2429, '221e5540875a7d158dab1a1d15e751b52670484471050f5c5c971ae51456d29e', 'd330ce31e19f2281871c17eff68b758dd86e7a0fff7b8cf93d3e9249e378e915', 'x.com/zoenshiueh_lieu/status/1928816700402631004', 'upload.wikimedia.org/wikipedia/commons/6/62/nlc403-312001068493-20426_%e8%b6%8a%e5%8d%97%e5%9c%b0%e8%bc%bf%e5%9c%96%e8%aa%aa_%e5%8d%b7%e4%ba%94.pdf ⿰扌默 ⿺辶粟', '[1544,1545]'),
  (2433, '1b0b18f07d85590c495faa6888ac64556acc6b0ae911f70552223ee438fa5b3f', '01e27157279943f8e19204695599fa3a0ba42e2ef5467645c3b249c621ed48fb', 'x.com/utetamutete/status/2120324969217609754', NULL, '[1546]'),
  (2435, '25cb953a9c19138574c38e684aa41cd0d5ec2e82ef071c148b990bd186f09afd', '70a516b41609d7c51bfbf90a5a30c7ace0968b152698be06c88d391a62bf8352', 'x.com/ni9man10/status/2121966005459247299', NULL, '[1547]'),
  (2436, 'f0e4fe39b95b04d0fa703739f1ec75cbe250a45e0e21d647b49bd1c11cd6877e', 'f507e43b85d33e2de2ad605a51cbc7d56aa0a490dfae5a09044d385650fd14c5', 'x.com/ni9man10/status/2112117741524312068', NULL, '[1548]'),
  (2437, 'adb939ea3b1e692e6ffb3120061164622d47016a5273736ebe52f5d573ddf3d5', '2f4d249081178d7e95c6bc28ff045fd06c373074ec1dd4278eb8787a4b0ef9f5', 'x.com/ni9man10/status/1969339741083463945', '⿰飠𠂢(ws2024-04200) pie的音譯 用例如薔薇⿰飠𠂢(店名)', '[1549]'),
  (2438, '841a81cde4bbe3cbcfd5f8f0b04593792db345af5ab5526a2f9ef2a68be9c2e3', 'e3429af85265cc0674b4238cee472addd135b80eb7f7b9b80c8e04ab194042e7', 'x.com/ni9man10/status/2070441716671512629', NULL, '[1550]'),
  (2440, '13b762998eb35dc895e407a59e1533401fe22bec398c9703f7535b2a7d75536c', '522f476e36ecbf9ee34ce4ec0724f4fc5307b29975f39b653f296fc956ddac42', 'x.com/ni9man10/status/2064018996916298223', NULL, '[1551]'),
  (2442, '8d49509c0135ac5838ae2240947e7503760066ec6d83f70957486029261806fe', '3a04b3a63786186fc64c2e72e63ffb578b4a8d1988b8e52bc151e1c32833d07e', 'x.com/ni9man10/status/2063606279298498856', '⿰禾感米(オニジュズダマ) https://dl.ndl.go.jp/pid/2536012/1/7', '[1552]'),
  (2444, '64eb4def9445e062c2af8e7be10f8ed1aa0fefb0188079632db5d249c571acc8', 'bcbeee1c4ec8d69d3aa00f800ecd499d1d037706c8b5ca4f59875dcd2f68c6ee', 'x.com/ni9man10/status/2027271985362030970', NULL, '[1553]'),
  (2445, '43468c2b7b075fa78d13bc7a56e7fe62017366f05c4eb17001f0983a4a1b4661', '3faa85e482b041bb05ca0d63a2c2d1180e1e6f8778cdd0c23d5773b6c4f95a58', 'x.com/ni9man10/status/1979848420509855772', NULL, '[1554,1555,1556]'),
  (2448, '94d510c3ddbfd7ec2c26d19cdb29269ddddad89c19d3c60cd7613cd327689216', '08982bfc22bacf20dc788ae1904facf9e5b87a45bacf8e848fbd9b714398b2ac', 'x.com/ni9man10/status/1969325723312590988', 'unicode未收錄漢字 ⿰魚呆 閩南語/魚名用字 用於鮕⿰魚呆,即鱧魚', '[1557]'),
  (2449, 'd6586a1a493533bbcffe3aed41932c83597e79902209e852c9cc9777b4f17d7c', 'ba2fe44ccddc49099ddee24401217929e57b7c9818a5ac92d04c4196c3938310', 'x.com/ni9man10/status/1969282506085065048', NULL, '[1558]'),
  (2450, 'e940f4f77e81fbb021b3eaa308a6f78b94b7a009cb6c4a2c43bbfaead134efe7', '4f12b58aa42ca5f30e0d2f24f08c1743d3b85a355c3273d6f4b3f6c000c64100', 'x.com/ni9man10/status/1969269869628543268', NULL, '[1559]'),
  (2451, '08941bd642a3df16656c1fc25b78b153d8253c84138879fc047a230cfb988779', '29e26687a45a9bea114e5d293760690631893c28c529c480224d101fc59c9dac', 'x.com/ni9man10/status/1966776489677914426', '⿰金四~九 ⿰金四和⿰金六在擴j,只差⿰金七還沒被unicode收錄了', '[1560]'),
  (2453, 'c3a56734f32dc169c399e0e7323a221589fca3cefa5300c6ae1931712e028c02', '646e5deb0e1d1814edc1be0703165d95bace7dfba9d80248569b730305b7d149', 'x.com/ni9man10/status/1966640217529729425', NULL, '[1561]'),
  (2454, 'c7118254aebefabf4a30cd594fcc7763c6575ad003e65f73d1f43a99650da62a', '073862525965697975cf0271c9bb9120afa8cacc99aef220eb1cb53f22b01ef0', 'x.com/ni9man10/status/1966377215765147699', NULL, '[1562]'),
  (2455, '6ab2d08e4578f04d35e76cc081b4bfd60d369dc21539676c152bf72921984d32', '75ea501257dee450d3f5882daf991056cbb9abb24df02054aaf1779a50bf8636', 'x.com/ni9man10/status/1964298919946703175', '⿰舟必是bilge的意思。我一直以為這個字已經沒有在用了,但看來這個字還活得好好的', '[1563]'),
  (2457, 'd6ca4a6c4381b16f494967b0a1c9eee6d7235419b6a7a67b056a17e7f629ae37', '4132461fd9d503004d0127e0074b09cfc7dbf128e09d3bcce0580115de9a707c', 'x.com/ni9man10/status/1964158175470645386', '⿰岩亢拘力 台語控固力的一種寫法 出處:https://hdl.handle.net/11296/87h428', '[1564]'),
  (2458, '6dcf6b2010b669636fee753537b40e14d2d97de3edf3a70bd8952b78dd5d43a7', '29cb00b732ecbe76095fe84edd522da1e6c4119cbbcc19954b36a8233d5c4c21', 'x.com/ni9man10/status/1963147676184465521', 'ws2021-02183 (⿰火寽)用於人名洪軍⿰火寽,這個人目前只能google洪軍將才能搜到 #漢字', '[1565]'),
  (2460, 'ac6054fee2a6da878a049fbd1f81a38cec3d4f8cf96b692d1adcf18a6ef3f0b7', '1d0d5fccf1f1ee783bce780f588c93b1395508c489f4a397e72610c31318fbda', 'x.com/linanningnew/status/2101932845958865063', '台灣語典 ⿰忄麥,後來造了⿰要卜来表記来著🤔', '[1566]'),
  (2461, 'f7d9c9fafb204653dc7142cb0da79077d3f65ac2431204eaebe5c3b3c5e41b5b', 'd59d72b81f8487534c9bc2c98e565426b4809b6b6eceafab00fa4f3871209ad2', 'x.com/linanningnew/status/2101533422024032658', NULL, '[1567]'),
  (2463, 'f9aa45eb57ec197c076f45d36fc2d38105a14df8c52cbf002a3bf0c17c19bb4f', '122c5b40c9b5e89f0e9b12223794635bab1aa107aae36fc9a7fac121d19e9fb9', 'x.com/linanningnew/status/2101169239122182430', '⿱娚心? 戀? 不知有無更多出処🤔', '[1568]'),
  (2464, '5d624caf72290e318b05dcf976977bad46fdf1ce8b9fbe3708a530639e415176', '740201ff12e7ce9615f06588df7aba327882db53a55716ff65105217e3063db2', 'x.com/linanningnew/status/2091394063635279988', NULL, '[1569]'),
  (2465, 'a5d05372680a218a01d64b42bdf5841a8dcf421859327e173f2136dad256eb0f', '99e839e87c5f9a8568303462c13ade4fe14a5cffb47420c89477a521462105db', 'x.com/linanningnew/status/2086505394961314166', '很久之前看的,留了一張圖 除了⿰訁人→認认 還有箇「⿱牛水」,現在看來,想必是「水牛」的合字罷? (僅為猜測xd)', '[1570,1571]'),
  (2468, 'a937550197484f9391a10cf986583ae62ad02760df61ca0c2015002f9a0b0148', '1374fc91b58a0dea447b6f6987830825f58d3e63a5d5e1a8d74351034c728d2b', 'x.com/linanningnew/status/2075026609770266771', 'news.gmw.cn/2024-08/11/content_37492828.htm ⿱一丛,ws2017gxm00417,目前為「postponed for better evidences, 2020-06.」 #漢字 #表意文字', '[1572]'),
  (2470, 'a28d3d0d30da9c2ef9edd216a698da7b109cd0ca2620077b948d7a341076f8f1', '3f54a411f94c2b2af9d41b5232175739f477fa6ab51a18f1b5166a9cc7511d8b', 'x.com/linanningnew/status/2074902536855916972', 'p. 24 註:合畧字「无产阶级」書中字形錯誤,應為「⿱无及」而非「⿱元及」 可補充於 ⿵门丅 utc-03526 ⿸厂史 utc-03534 ⿱次及 utc-03540 ⿳亠丷⿱冖义 utc-03531 (還是得等部件區,表述太麻煩) #表意文字 #漢字', '[1573,1574,1575,1576]'),
  (2478, '6d8b630e90805996a981a33241132ae013b2871db540c46f9d2f114f446d870c', '0c323cc4c6d6a125fbd9336c9a6e0e09a5ecc2c387c33b64b21ea6931a279aeb', 'x.com/linanningnew/status/2099479397774643293', '聴它人說,圖一疑似来源於圖二,話說有人看過这本書嘛🤔', '[1577,1578]'),
  (2482, '4049c1049735b5c60a14d938d24a7d4998755076ae41bea65c3bea790b4186d0', '026929468504451453d19db8810ab3ce020f3fb62de31d46b0fe0896503e1f8b', 'x.com/linanningnew/status/2074135649507311734', NULL, '[1579,1580,1581]'),
  (2487, 'c1e06e634e76369636972b41131518f52330fb22ad2cdf8b995931ef099e09d6', 'f78ea7ce1caffc124514160f4dc5ca82a5b6d6353ea93f0725b0086bf29354b6', 'x.com/linanningnew/status/2070457810777932255', NULL, '[1582]'),
  (2488, '7a984b160a301a75c07c397819ac1fbf3e53709a3a517185cc622fa060076a78', '057ce13d132357417be39f60bc5e5608e4d73d3f3af7e3cd4c49f9c1025c247d', 'x.com/linanningnew/status/2068300822027653289', NULL, '[1583,1584]'),
  (2491, 'bcb91acdbebe4ed018e12535f3b28c92a9f9877551c9f6b1ccff996adf5c0505', 'c322a410923853b9944de86bf06cf80ffbea280e4ca0d133bcaca3bd872bb8ee', 'x.com/linanningnew/status/2043200641112109534', '意→e,聲旁替換(12) 或可視為「从匸,一聲」(醫作e亦有用例)🤓☝️ 此外還有合畧字亖例(15下) source: 01. 各地人士对《汉字簡化方案草案》的意見提要,中國語文第03期,1955年 02. 医卫书稿抄稿易误字一览表,1970s (保留標題用字) #表意文字 #漢字', '[1585,1586,1587]'),
  (2497, '8ea7fa11518e643c8bf70fd94ac8c4dc5cb98b0e487af30c1ca4a6c17c76dbbb', 'ff4d18cbcc140cc9a4d48bc2205aeb077289f21778a5d1db13ac5ee8b4acaa70', 'x.com/linanningnew/status/2009267595422388525', NULL, '[1588]'),
  (2498, '93fbc31fb847fcac1a3f431fb313bfbb89b946cf566811ae46510677aa877af6', '0977e6d7290d834b61420cd071f0f0f38a3e23dc92d63714b1ce8534f0867a14', 'x.com/linanningnew/status/2006190540933779671', '山東湽博方言字⿱奶大 老⿱奶大→鬼谷子母親 音疑同懶,義疑同媽(孃)', '[1589]'),
  (2500, 'a7c46bf90e493c06a9b0cf27a5256ab4e494aac92551824ac8fbc4b89bc641cc', 'e01e0bbda15192264e229e9ea3a78eccceeea32180315e1325a878a047620d55', 'x.com/mujirushi_myoji/status/2121960688746889346', '⿱䨺龘(たいと)は『実用姓氏辞典』(1964)には掲載がある。 https://dl.ndl.go.jp/pid/2983759/1/508 ちゃんと調べたわけではないので、もっと古いものもあるかもしれない。', '[1590]'),
  (2501, 'f52c7e913a4eae2b1ff28bf5bf12b16440b7bdc579109159fdb7af755e293c9f', '64815d7ea133dc08970c5ebc5c4145a08a3346eb4b669fa47119cb4123a94490', 'x.com/xwcvlua1jn96009/status/2090792976213848406', NULL, '[1591,1592,1593,1594,1595,1596,1597,1598,1599,1600,1601,1602,1603,1604,1605,1606,1607,1608,1609,1610,1611,1612,1613,1614,1615,1616,1617,1618]'),
  (2530, '8cae5755b51781f46d82047d293d50ddaa08109d62082145ec01854ea2534c4e', 'dd821f308235c0aa4e7fbb818cde72ac325bcb05b6d81926a094c89d2ca37f82', 'x.com/_xlxxlx_/status/2077347809607729591', NULL, '[1619,1620]'),
  (2533, '859df50b8db8a2f896a92db539a053b9814fb5ab5c788f18c2e8f41ce4cff705', 'cfe6615423f25c6ef6a4b84b83551a4264571c2b9a822b0722af7b52cec90de1', 'x.com/jumanjikyo/status/2076897066945786158', NULL, '[1621]'),
  (2535, 'c39d47c092e318c9f64fb0b0febb0872946ae741cce1d12c77cc58d934dfe6ef', 'e912d6cc20752211c562219ceff9226c287fc5141c9d7fbf756e094fc28eece8', 'x.com/xwcvlua1jn96009/status/2069924049053163558', '「⿰火焱」? https://www.shonan-navi.net/shop/shop.shtml?s=5860 (写真はgoogleマップより)', '[1622]'),
  (2536, 'e72e3262aa69512ea426aa521c2898e5790e51288d7e6a71135fa15ac6824eac', '61f4f61e57a8f5ebaed2f98df0c1dd41288af7acc421a514f1ca416aa80a98f6', 'x.com/xwcvlua1jn96009/status/2063580180300623941', '大体このあたり ⿰米林 ハヤシライス ⿲木十木 機関銃 ⿰白包 迫撃砲 撣 手榴弾 ⿱龸水 掌水雷長 ⿱龸ホ 掌砲長 ⿱龸キ 掌機長 ⿱位皿 射撃所? ⿰車ト トラック ⿰舟心 中心線 ⿱國共 ⿴囗共 国共? ⿰舟⿱一大 第一大艇 舟⿱カ一 第一カッター ⿰舟⿱カ二 第二カッター', '[1623,1624,1625,1626,1627,1628,1629,1630]'),
  (2544, '1f6f7e1996fc9b001490831351fa95ba465316cbc64d8dbb566f20289cd975c9', 'ac2601675e58095c203c9b7fd906ab51bca668a0888adb0d560ede5a23f50a9d', 'x.com/xwcvlua1jn96009/status/2048011540159476001', '「⿰扌單」(手榴弾)、「⿰白包」(迫撃砲)を「陸軍の字?」と付して載せたが、もしかしたら民国軍(国民革命軍)由来の字なのか?', '[1631,1669]'),
  (2546, 'a5723d183a88ba7b84050f1daa7f2060560c2191698fb65902fd77efffc37610', 'f5535b4f74509d922b21e601f45b318cd2b3fa8331bb22e1a510a6cca28df92e', 'x.com/xwcvlua1jn96009/status/2041389871605178821', '「国民党」と「共産党」の略字を見て思い出したのだが、 「⿴囗共/⿱國共」、辞書に無くで米軍の異体字のみに掲出される謎の字。 時期(表は1945年に制作)と字形から見て「国共」(国民党と共産党)のことだろうけれど、米軍の情報局はどこから拾ってきたのだろうか?', '[1632,1633]'),
  (2549, '77cc5dba78af7cc8e6d21b15f705fbcaea49d42e3de68249f650be494c82e8a0', '28dfbbd2f6473750673c5c2cf70dac9bea05531d307fa145f79c6577f11ee2f3', 'x.com/xwcvlua1jn96009/status/2038797120061477263', NULL, '[1634]'),
  (2550, '7a17bd6b3555cdf8859e73ee3a82d44e4b0a656090aa26efc231c4dce152498e', '712371eb6c84679c3db4ab0300c87b56251060e04d506ab3e50372d8e84a97a1', 'x.com/xwcvlua1jn96009/status/2007091078659539421', NULL, '[1635,1636,1637,1671]'),
  (2553, '67bdd8c824124f67623f71f619f74c3da5050c4d90a993ddf617f05c9006f062', '6974669c2a0f3f6a2a318b2afa4431a39b90dda54f7ac15d347b70a9c819f2de', 'x.com/xwcvlua1jn96009/status/1905451775894978957', NULL, '[1638,1639]'),
  (2555, '7327c1488c8053e611f29171eae647bbb7da7ad6d6bd3845fcd9ab55474ea555', '00a28b185e24b91579c0a73d6d3ac3eeca86900e838a5eb8e8d5ce0ae4a297d1', 'x.com/xwcvlua1jn96009/status/1882200541796909287', NULL, '[1640]'),
  (2557, '8d44d9fdface4fc2838eee17da4b2e413678002526f44666a992fa4fbfd3e369', '35431c073432cefcd513ce033980f35b72d2f00101c9c7aa9908d453d447f24e', 'x.com/xwcvlua1jn96009/status/1803709584093442214', NULL, '[1641,1642,1643]'),
  (2563, 'a4f8690381442b9cf61be4a62f371313ef2f7f314cb2e937ff5121d4ebc29f90', 'e6af40d99157c9a5c6050d4d468b38eb7c61a096d9b181f867051675abad1902', 'x.com/xwcvlua1jn96009/status/1873567531883192721', NULL, '[1644]'),
  (2564, '6640557a7d38f9c84c11c5d55e87ac1be4cd27276036bf7da4fa34cc0fdeac06', 'd68056e407a4a763aff0bd132ce9d776a05d2d98a07338e50dc1bb01bb698bf6', 'x.com/xwcvlua1jn96009/status/1858068465216815592', NULL, '[1645,1646]'),
  (2566, 'b9c9459ab4e17618da338ae42147583559a2674d4d27caa754e4f58ee679b6f9', 'cf5b8d2ec466fb40c26ea17799317f88d0567cd830e8ddfe1eed94d8dc6b4cb5', 'x.com/xwcvlua1jn96009/status/1855227606070878516', NULL, '[1647]'),
  (2567, 'c6fca1e463ae54c2c92a843984b7b738aced4d3b3d2ee2735a54c2bbcafcf2a3', '3e07cf017ac86e47765f55af02ee71268cf503353a3ef12c8ed1b6a6d18ab7ec', 'x.com/ni9man10/status/2070440629642068026', '𠓉(⿱光⿰光光)', '[1648]'),
  (2569, 'b4c4ed27b7bbe5e610453453e40a083c66dcff15479c87ef8d8e43a0ca053bd6', 'd463ef4e5721a1d8ec8d78582fa2473ab4306d038c25b0f91c4d83af8fe42675', 'x.com/ni9man10/status/2013900348273099114', NULL, '[1649]'),
  (2570, '34db09b35bc226c1a49c9cdab8d31f4dc8b8498fef9ee1835cec16d6ba8336de', '76823a3b04b26118ad94e0d3efee84e6e4b0f320b721785d6881418b4ea2e006', 'x.com/ni9man10/status/2013897458196070883', NULL, '[1650]'),
  (2571, '1f6d5266224e31df5d17382231af5822e57a1214a2e1a97bf4f2388d709a1e1c', '6f42cc85254a345e54d5a6b7904adff67516a4416cbc77a4c87d806cb83e1742', 'x.com/ni9man10/status/2013896761551802509', NULL, '[1651]'),
  (2572, '9424ea3bf9f5b4a9ce6fb7bdbce4cac57552dfb2b8ab6e6e42286a89b699b518', '29a6de14c386ee6dd5a69cd0603b3782ca2e775f412b2d465ceba536a8a963d2', 'x.com/ni9man10/status/2013896003615629349', NULL, '[1652]'),
  (2573, '44b794412ac31c864a2fc5c6f94aaea9b3108b88e784ee3abd083a130717ffc1', 'fcf4dd562d1c21c5fa62d6b09cdad20b964e407447441a966abf3eb3136d71f8', 'x.com/ni9man10/status/1974456610631397434', '𦴿(⿱艹玲)', '[1653]'),
  (2575, '68dd124ead97b81ded5585d688320d6cea5476387c22c83c39e3f9301c3077fc', '2618e326de1ad5171e982772610147636cce387d09ffeae734afa03d6900a275', 'x.com/ni9man10/status/1967097378944807006', '𭤕(⿱文示)藤圍', '[1654]'),
  (2577, '6b7aea3e931d279bc990f8dc9510df592705d20c90fc5ea29820e95b83bada9d', '33858a0d2ef591a20a288741cbca4ff0591e652125ece6524f72f527e2bbd24b', 'x.com/ni9man10/status/1966472396904505838', '擴j字 𲰕(⿰王欝)', '[1655]'),
  (2578, '3264dea72bde211855eeb8e63aea04a77688cce16134a989d09e23886b1f389c', '38c973d44ced0bb1f49ae9120d8446b50300320f664e224c755f611f9b3c0557', 'x.com/ni9man10/status/1966467737393209774', '擴j字 𲩍(⿰世求)', '[1656]'),
  (2579, '8fa2f0f2ea25aa6df89ed08dee2e95ecc98fff33da541636bc108e21215637b2', 'e0aaa99e692385eb39750ac0927afa178b4a153a37fe653e93be812c8e6cd7d6', 'x.com/ni9man10/status/1966466386999574662', '擴j字 𲥸(⿰有木)', '[1657]'),
  (2580, '7f0cc958f3e5627edbc3d95f6ab97fdb7e84cfb30649ca7ca966bea9787de7b0', 'c382069d268a94c139b884307b82b155b167393ba30c36505c680936ad54a3f4', 'x.com/ni9man10/status/1964624128796967398', '羹的4種異體字 (火、米)×(庚、更) 我以前一直以為沒有人寫成𪸫(⿰火更)的,因為從來沒看過。如今總算是見識到了', '[1658,1659,1660,1661]'),
  (2584, 'afb139ded9da2351ef551259b9fd830238ab3c9ec4289a651c7d90cea16874ab', '965d74d4f03fc28d78fa8a808fbe9454332b3a6cfa64464b4914e21107814bd5', 'x.com/ni9man10/status/1964125682146869288', '萌𬟘(⿱艹穗)園藝', '[1662]'),
  (2585, 'a5e27c59c2fe05fb53c6adccb15a7273f37caf38d9e52a59f446b6448e4e4a5e', '45749305ac2a09deefeae3559f61253645178ed3efe68fe47b195be05c19a880', 'x.com/linanningnew/status/1994226721420169343', '纜之俗簡䋱(簡體為31e9c),地點杭州西溪濕地(杭州市電力局立) 圖來源於qq群聊記錄,並提及有多凷分布', '[1663]'),
  (2586, '638d1437972de30e7e0223c2c99629aa108454cfddd925a9e67cc579982b8861', '0ba8c45d7df49246905727f15070ff5b411f76748b16bc1001b9b521ca3927ed', 'x.com/linanningnew/status/2068300822027653289', NULL, '[1664]'),
  (2588, '1be836177d3371cfe88c421da987b40f9204d080cc491b3f3e35149fc5eaaf53', '3b97347897a799a51fd1994a0f3bd07c50186336e1d6e41655470b0875783d45', 'x.com/linanningnew/status/2074135649507311734', NULL, '[1665]'),
  (2590, '39db012186c6430f8eb783604a839f35b4870bb1ee68866580c5debb65dec93d', 'b715025c8a15c3a0480cb2f3a82ffbabf6ea0d1c0bd680671e9c6bd02f9b04e7', 'x.com/linanningnew/status/2099890798330585094', NULL, '[1666,1667,1668]'),
  (2597, '07200e9235fa27f7b674810e644622625eac550c285c3d6e5333e39e641cf4eb', 'e0297291dcee99a10056d3972779ca7f88d003fb7f927a43623cb846406e23d0', 'x.com/xwcvlua1jn96009/status/1879155594051129524', NULL, '[1670]'),
  (2778, 'f771505db407fc68c8bca52e003be50a563b7a3a09c9fac565fd8e0a803e5244', 'f053e46802ec99ca554bb7942fd14be3b38b1d88c5b2b974105c86608593bbc0', 'x.com/ni9man10/status/2099894003437273114', '⿸厂丶(歷)', '[1770]'),
  (2780, 'faae861e4d54c84ce64a49166f5fc77ca85b7ee61ecce0a8a1929cad75299a6a', '4c54aacc430b0d36e7b66b56b9841f581f12c6ddb84370ce8e9f20304ec04521', 'x.com/ni9man10/status/2090423783194804262', NULL, '[1771]'),
  (2782, '722ced0e5579926774dc584dc38bf8a49eb7c1a97702c6c498c6f3d93082756c', 'd5953f0849b52052155570589f3f91b40eb6c0e5ab6ad9367fd92023a94dbd71', 'x.com/ni9man10/status/1966805853799121158', '⿱口⿰口⿱丿丶(品)', '[1772,1773]'),
  (2785, 'a5c3b4f4deabcd688089f0636e37f0889d98977937470b90b300b520d49bbb31', '8c7e8c92e1f810912cc02928dd17521c0d5741362fe2b577efc084be6f8ad800', 'x.com/ni9man10/status/2070439626494665074', '⿰丰又(=數)', '[1774]'),
  (2786, 'f3c2d348a053716841ac076665576fd8fc16e0582aa144aa7a7d9cc891c7877f', '5eb2b16f0e22b987bd932d92b5574fe7cc9d2192e99d576f2e6ce5e04f3c614e', 'x.com/ni9man10/status/2066139475617661360', '⿱両电(電) #略字', '[1775]'),
  (2787, 'd51373b3ef756449e2f2a5770bd8a4be353936fe67d254420daa26dad1a727cd', 'dd5f3a438f7a9656a8e74b53e497aad3d792686cb43bff0b91d44f9019df43c3', 'x.com/ni9man10/status/2066112343592096209', '𨶹(⿵門絲)', '[1776]'),
  (2788, 'd9e0608276ca042c22a8242e683441a7fd1114d64f9adf44e375eb02953603ab', '487f4ed2de90a47e6c6e92e56d55369346eacaa07c19e745b3dbd55caee21790', 'x.com/ni9man10/status/2058787587192725676', '⿺⿱𡗗夂面(麵)', '[1777]'),
  (2789, '2729d17ef064c74dc125c15afa2991917370f7e864952f17d0b57b1fe0def063', '10d59c1c36068b80687217279f4863cd9c941d201b6d357e38c7730180b03623', 'x.com/ni9man10/status/2052677420885635356', '學:爻→文 製:⿱制二', '[1778,1779]'),
  (2791, 'b283cc7301e279d93f7a40daf66f464ead39a50b2ca4439fad9cc9f34a4c58ba', '3436dd92f202c5a25589a920e11fdd8aed345c59a22ac3560c6ed87e531e88ce', 'x.com/ni9man10/status/2042562844160594204', '「䟴」動 因為是腿部按摩器所以就把雨字頭換成足字旁了吧,還挺有趣的 #漢字', '[1780]'),
  (2792, '3c3e38c31f8d5a253702f65e57a8b569230600d476aa2c67bd42d6fc6ea49a2b', 'd4b486292fd31fa0973a2488337d93f1ee911b0c0c1ce4c5854165e15dafec47', 'x.com/ni9man10/status/2037359426806730770', '⿸广⿱艹幺(麼)', '[1781]'),
  (2793, '6981ccbfd54ca9e953966ddaefd796fbe0eda8bb5e565a59c13aa9fb2c49b73f', '1a23a1964f13c0f23905f61eaf6cb848965ff0bb7ba0d17e8a893030cdc5d2d8', 'x.com/ni9man10/status/2022299133340799204', NULL, '[1782]'),
  (2795, '5dc935c42ccaa83fbc8624e51db3a160888a64908eeb2004956ba65990c2d500', 'cef2eb514343f8f18a9cc4ac83a7b3a56bcdc54ab55f958ef66e4821fd71d846', 'x.com/ni9man10/status/1983144966625898994', NULL, '[1783]'),
  (2797, 'f25d1ba7f57fd3dcdde5724afb0e343c23ca437ef389439248453e39acdd4bd2', '35a7118ba0043a1c4723dfe437a8a1907c354998babb2cebabb90255db7d6b86', 'x.com/ni9man10/status/1981589170280960495', NULL, '[1784]'),
  (2798, '212711b6a94e174f977cb002c6e9cd80d54cc8f68d149c97b8de259b3b8fb1c1', '9a7ce07dcc6a435a29d7d167a5d5fb40b5a6fffbe0a8f80a53df5a4765bed382', 'x.com/ni9man10/status/1964496179917717854', NULL, '[1785]'),
  (2799, '1bb0b0139c46666ba14687d4ae29746d2ea7852a5b3b16d0b0d0d1c6196471ba', 'e1d89cd703b8592a6c72b94fd1459eee63176b6e81f94ddde926f27b552271eb', 'x.com/ni9man10/status/1964472728997810575', '台大教務處造字集有一個⿱亠斐,和登記統一文字tk01037450以及gj文字gj000999相同。不知道這之間有沒有關係', '[1786]'),
  (2800, 'de3c47fbd1e99eac5769f61fbbaf4e11edf527fb8fa37689734c5c270e9c9860', 'f9da551335c320247d1f1f523b1c248754a1b2a6b82fac11f88d2330c0537456', 'x.com/ni9man10/status/1963150503170429218', NULL, '[1787,1788]'),
  (2802, '91fbbb8f3824d28d5532c72491bef6c1f0e98b7d6774df8aaa78f3a5b895450e', 'fc3953e3c658ed4085ca46c55b0f9444520180bbca579c12c34f4a19d18b41a4', 'x.com/ni9man10/status/1967100753233015283', NULL, '[1789]'),
  (2804, 'd2587c855b91aaf2d4b63d7b0fcbc8cf3e21d7a17277fe007c9c78195390bb54', 'e6b8cea9669aa7ea806ff74dfa6839f5593e12b89163c61159961e01a762dbaa', 'x.com/ni9man10/status/1967105991222440189', NULL, '[1790]'),
  (2805, '00875b9bb05fe68c1aac581390acdc55c64021687ef76c71f48e1b5c5118ad53', 'a1f739ec3a0bda64ea1d0c9174a3b19d914a953a21b8e1048edc14f20d413942', 'x.com/ni9man10/status/1966814966918307879', NULL, '[1791]'),
  (2807, '22540c0cfcd33cbc97851023c21cd445ca58c936eb99e8e2db87d29b0d7cdc80', 'a01d385adcf3276918c56f4ca0e58e39927315afc51ce8d546abf21b1ecd12ec', 'x.com/ni9man10/status/1995749464397820373', NULL, '[1792]'),
  (2809, '7a9174ece40449087872ddcfd6a8f53e4e79bb207a8ea751989fb3b5657fac33', '2dfcab4770426144cf12a5377fa714a6a354b937e3016ce9edb0143dd5ec31f1', 'x.com/mfukuda_ben/status/2122200768396878314', '淕(りく) jis第2水準 淕別は陸別の旧称', '[1793,1794]'),
  (2813, '597c12d1356752314f851cd410d44e1e798f9424cb41192814198b7eed6eacc4', 'e0027eeaa3c9a1fef7dd681f5e8c513aa1a7f8e0af557ab728131ce743bb6aca', 'x.com/linanningnew/status/2122274739242901770', '李胜贞,李京龙,《安仁乡韵》 ,2017,p. 238', '[1795,1796,1797,1798,1799]'),
  (2822, 'dede6ed50b684f25ba3f246880fd33397840a782b6f56c4e25307d8717f35e82', 'b0b8ef1989c2918fca7062c13ddcb6c04fbb2c219e532d549ac2317fea2d5b9e', 'x.com/phoochaeween_/status/2122184267270947201', '哩マイル 呎フィート 吋インチ は 尺貫法の 里 尺 寸 に近いから此れに口偏付けたってのは分かるけど 碼ヤード 何?', '[1800,1801,1802,1803]'),
  (2827, '85e0904d9881ec3ed7a1ace5edb07f1f2c09e3b7465d8c99bc68abb6c9e91f76', 'ecaf7442c273e82081b576829e2a862cc7b92357c933d2510e18c2cff12fea08', 'x.com/ni9man10/status/2122272599157973141', NULL, '[1804]'),
  (2860, '1801b8613d5b270fd2557f9a67937b9c6026a73c40224a6b8282302dd155a573', '79c4900e9d0355edc895ad9f63122e3ec3316ca622b3a78924ee87a7bf57d299', '雲九', '添张更清晰一些的证据图片: 张应强、王宗勋 主编:清水江文书(第一辑),桂林:广西师范大学出版社,2007年,第7册第28页', '[1860]');

-- Never rename a shared source underneath an unreviewed link, a direct citation,
-- a hidden record or a contributor's different quote. The hash also guards edits.
DELETE FROM quote_titles AS q WHERE NOT EXISTS (
  SELECT 1 FROM sources c WHERE c.id = q.source_id AND c.hash = q.old_hash AND c.title IS NOT NULL
) OR EXISTS (SELECT 1 FROM sources WHERE hash = q.new_hash)
  OR EXISTS (SELECT 1 FROM sightings WHERE source_id = q.source_id)
  OR NOT EXISTS (SELECT 1 FROM sighting_vias WHERE source_id = q.source_id)
  OR EXISTS (
    SELECT 1 FROM sighting_vias v JOIN sightings s ON s.id = v.sighting_id
    JOIN entries e ON e.id = s.entry_id JOIN sources c ON c.id = v.source_id
    WHERE v.source_id = q.source_id AND (s.hidden_at IS NOT NULL OR e.hidden_at IS NOT NULL OR e.merged_into IS NOT NULL
      OR v.sighting_id NOT IN (SELECT value FROM json_each(q.members))
      OR (v.quote IS NOT NULL AND v.quote IS NOT c.title))
  );

-- The last note contains both a gazetteer transcription and a comment by the
-- author of the linked post. Only the latter goes on the intermediate source.
CREATE TABLE quote_notes (
  sighting_id INTEGER PRIMARY KEY, entry_id INTEGER, rev INTEGER, entry_mark INTEGER,
  via_hash TEXT, old_note TEXT, words TEXT, remaining_note TEXT
);
INSERT INTO quote_notes VALUES
  (20, 15, 1, 46, '3a3dba8cd504e0ba15d492fbbd5cba2fa5895e73e49b5ef2a9bc146a80ed7bdc', 'ジェンダーレスがどうちゃらの「U+323BF 𲎿」とは無関係', 'ジェンダーレスがどうちゃらの「U+323BF 𲎿」とは無関係', NULL),
  (1892, 1814, 3, 5262, 'f29d487cef58b394af25154bcabc91a7fc3b8296a2dc2744168f1683f3aa5a62', '想起这位画师，妖夢くん，时不时写错字。比如这张里面把“避”写成了“遐”', '想起这位画师，妖夢くん，时不时写错字。比如这张里面把“避”写成了“遐”', NULL),
  (1903, 1825, 1, 5290, '410987bc47698d6402d4f8b895e2f8e6de1d737c239465655b29b186c1890378', '「猍人」條：「猍人潯境四屬皆有……西遷來者故曰來」。發文者注「猍人 Hakka」。', '猍人 Hakka', '「猍人」條：「猍人潯境四屬皆有……西遷來者故曰來」。');
DELETE FROM quote_notes AS n WHERE NOT EXISTS (
  SELECT 1 FROM sightings s JOIN entries e ON e.id = s.entry_id
  JOIN sighting_vias v ON v.sighting_id = s.id JOIN sources c ON c.id = v.source_id
  WHERE s.id = n.sighting_id AND s.entry_id = n.entry_id AND s.rev = n.rev
    AND s.note = n.old_note AND c.hash = n.via_hash AND v.quote IS NULL
    AND e.hidden_at IS NULL AND e.merged_into IS NULL AND s.hidden_at IS NULL
    AND n.entry_mark = (SELECT max(id) FROM revisions WHERE entry_id = n.entry_id)
);

CREATE TABLE quote_edits (sighting_id INTEGER PRIMARY KEY);
INSERT INTO quote_edits SELECT v.sighting_id FROM sighting_vias v JOIN quote_titles t ON t.source_id = v.source_id
  UNION SELECT sighting_id FROM quote_notes;

INSERT INTO source_aliases(source_id, lookup, spelling)
  SELECT c.id, coalesce(q.alias_key, lower(c.title)), c.title FROM sources c JOIN quote_titles q ON c.id = q.source_id
  WHERE true ON CONFLICT(source_id, lookup) DO NOTHING;
UPDATE sighting_vias AS v SET quote = c.title FROM sources c JOIN quote_titles q ON q.source_id = c.id
  WHERE v.source_id = c.id AND v.quote IS NULL;
UPDATE sources AS c SET title = NULL, hash = q.new_hash, name_lookup = q.new_lookup
  FROM quote_titles q WHERE c.id = q.source_id;
UPDATE sighting_vias AS v SET quote = n.words FROM quote_notes n JOIN sources c ON c.hash = n.via_hash
  WHERE v.sighting_id = n.sighting_id AND v.source_id = c.id;
UPDATE sightings AS s SET note = n.remaining_note FROM quote_notes n WHERE s.id = n.sighting_id;

-- The title tokens are still indexed in quote order. Two whole notes move with
-- all their tokens. In this reviewed version of entry 1825 only the attribution
-- contributes 發, 文 and 注; 者 occurs in the retained gazetteer transcription.
DELETE FROM entry_tags WHERE tag IN ('w:發','w:文','w:注')
  AND entry_id IN (SELECT entry_id FROM quote_notes WHERE sighting_id = 1903);

-- Append ordinary restorable sighting revisions; the old snapshots stay intact.
CREATE TABLE quote_editor (actor TEXT PRIMARY KEY, at TEXT);
INSERT INTO quote_editor SELECT lower(hex(randomblob(6))), strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE EXISTS (SELECT 1 FROM quote_edits);
INSERT INTO people(id, name, created_at) SELECT actor, 'Catalogue maintenance', at FROM quote_editor;
INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, summary, actor, at)
SELECT s.entry_id, s.id, 'sighting_edit', s.rev + 1,
  json_object('place', s.place, 'url', c.url, 'title', c.title, 'author', c.author,
    'publisher', c.publisher, 'report_date', c.report_date, 'original_date', s.original_date,
    'page', s.page, 'context', s.context, 'style', s.style, 'types', s.types, 'note', s.note,
    'vias', json((SELECT json_group_array(json_object('url', url, 'title', title, 'author', author,
       'publisher', publisher, 'report_date', report_date, 'quote', quote)) FROM
       (SELECT vc.*, v.quote FROM sighting_vias v JOIN sources vc ON vc.id = v.source_id
          WHERE v.sighting_id = s.id ORDER BY v.position))),
    'media', json((SELECT json_group_array(json_object('image_key',image_key,'image_type',image_type,
       'image_w',image_w,'image_h',image_h,'thumb_key',thumb_key,'box',box)) FROM
       (SELECT * FROM sighting_media WHERE sighting_id = s.id ORDER BY position)))),
  'Move quoted words to the cited intermediary', editor.actor, editor.at
FROM quote_edits q JOIN sightings s ON s.id = q.sighting_id LEFT JOIN sources c ON c.id = s.source_id CROSS JOIN quote_editor editor;
UPDATE sightings SET rev = rev + 1, updated_at = (SELECT at FROM quote_editor) WHERE id IN (SELECT sighting_id FROM quote_edits);
UPDATE entries SET updated_at = (SELECT at FROM quote_editor) WHERE id IN (
  SELECT s.entry_id FROM quote_edits q JOIN sightings s ON s.id = q.sighting_id
);
DROP TABLE quote_editor;
DROP TABLE quote_edits;
DROP TABLE quote_notes;
DROP TABLE quote_titles;
