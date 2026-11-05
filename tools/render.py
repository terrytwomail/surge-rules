#!/usr/bin/env python3
"""把設定檔範本裡的 SUKKA/、DLER/、OWN/ 前綴換成 lock.json 固定的 jsDelivr 網址。

用法：render.py 範本 輸出檔
範本含私人規則，放在本倉庫以外；本工具只讀範本、寫輸出檔。
範本引用了 lock.json 沒有的檔案時直接報錯，避免用到沒審核過的清單。
"""
import json, os, re, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFIX_RE = re.compile(r'(?<![A-Za-z0-9_])(SUKKA|DLER|OWN)/([^,\s]+)')


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    template, out = sys.argv[1], sys.argv[2]
    lock = json.load(open(os.path.join(ROOT, 'lock.json'), encoding='utf-8'))
    cdn = lock['cdn'].rstrip('/')
    missing = []

    def swap(m):
        name, path = m.group(1), m.group(2)
        src = lock['sources'][name]
        if urllib.parse.unquote(path) not in src['files']:
            missing.append('%s/%s' % (name, path))
        if not src.get('commit'):
            missing.append('%s 尚未固定提交' % name)
        return '%s/%s@%s/%s' % (cdn, src['repo'], src.get('commit') or 'UNPINNED', path)

    text = PREFIX_RE.sub(swap, open(template, encoding='utf-8').read())
    if missing:
        sys.exit('範本引用了未審核或未固定的檔案：\n  ' + '\n  '.join(sorted(set(missing))))
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('已輸出 %s' % out)


if __name__ == '__main__':
    main()
