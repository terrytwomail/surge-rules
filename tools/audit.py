#!/usr/bin/env python3
"""surge-rules 審核工具（只用 Python 標準函式庫）。

用法：
  audit.py check                       對目前採用的版本做完整的自動檢查（第一次審核用）
  audit.py report [--out FILE]         比對「已採用」與「上游最新」，列出差異與檢查結果
  audit.py add-files TEMPLATE          把設定檔範本引用到、但 lock.json 還沒有的檔案加進去
  audit.py bump SOURCE SHA --i-reviewed
                                       審核通過後，把 SOURCE 換到 SHA，重算每個檔案的雜湊

只讀網路上的公開檔案；除了 bump 與 add-files 會改 lock.json，不寫任何其他東西。
"""
import argparse, datetime, hashlib, ipaddress, json, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCK = os.path.join(ROOT, 'lock.json')
PROTECT = os.path.join(ROOT, 'own', 'protect.txt')
PREFIX_RE = re.compile(r'(?<![A-Za-z0-9_])(SUKKA|DLER|OWN)/([^,\s]+)')
NORMAL_TYPES = {'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD',
                'IP-CIDR', 'IP-CIDR6', 'IP-ASN', 'GEOIP'}


def http_get(url, accept=None):
    headers = {'User-Agent': 'surge-rules-audit'}
    if accept:
        headers['Accept'] = accept
    token = os.environ.get('GITHUB_TOKEN')
    if token and url.startswith('https://api.github.com/'):
        headers['Authorization'] = 'Bearer ' + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
        return r.read()


def raw_url(repo, sha, path):
    return 'https://raw.githubusercontent.com/%s/%s/%s' % (repo, sha, urllib.parse.quote(path))


def fetch(repo, sha, path):
    return http_get(raw_url(repo, sha, path)).decode('utf-8', 'replace')


def latest_sha(repo, branch):
    data = json.loads(http_get('https://api.github.com/repos/%s/commits/%s' % (repo, branch)))
    return data['sha']


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def load_lock():
    with open(LOCK, encoding='utf-8') as f:
        return json.load(f)


def save_lock(lock):
    with open(LOCK, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(lock, f, ensure_ascii=False, indent=2)
        f.write('\n')


def entries(text):
    """有效條目（去掉註解與空行）。"""
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(('#', ';', '//', '!')):
            continue
        out.append(s)
    return out


def is_domainset(path):
    return '/domainset/' in path


def load_protect():
    if not os.path.exists(PROTECT):
        return []
    return [d.lower() for d in entries(open(PROTECT, encoding='utf-8').read())]


def checks(path, lines, protect, reject_list):
    """回傳 (嚴重度, 說明) 的清單。reject_list=True 時，碰到保護清單算嚴重。"""
    found = []
    for s in lines:
        if is_domainset(path):
            dom = s.lstrip('.').lower()
            if '.' not in dom:
                found.append(('高' if reject_list else '注意', '整個頂級網域：%s' % s))
            if reject_list:
                for p in protect:
                    if p == dom or p.endswith('.' + dom):
                        found.append(('高', '會擋到保護網域 %s：%s' % (p, s)))
            continue
        parts = [x.strip() for x in s.split(',')]
        t = parts[0].upper()
        v = parts[1].lower() if len(parts) > 1 else ''
        if t not in NORMAL_TYPES:
            found.append(('注意', '非一般規則類型 %s：%s' % (t, s[:160])))
            continue
        if t in ('IP-CIDR', 'IP-CIDR6'):
            try:
                net = ipaddress.ip_network(v, strict=False)
                if (net.version == 4 and net.prefixlen <= 8) or (net.version == 6 and net.prefixlen <= 16):
                    found.append(('高', '過寬的 IP 段：%s' % s))
            except ValueError:
                found.append(('注意', '看不懂的 IP 段：%s' % s))
        if t == 'DOMAIN-KEYWORD' and len(v) <= 3:
            found.append(('高' if reject_list else '注意', '過短的關鍵字：%s' % s))
        if t == 'DOMAIN-SUFFIX' and '.' not in v:
            found.append(('高' if reject_list else '注意', '整個頂級網域：%s' % s))
        if reject_list and t in ('DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD'):
            for p in protect:
                hit = (t == 'DOMAIN' and p == v) or \
                      (t == 'DOMAIN-SUFFIX' and (p == v or p.endswith('.' + v))) or \
                      (t == 'DOMAIN-KEYWORD' and v in p) or \
                      (t == 'DOMAIN-WILDCARD' and re.fullmatch(v.replace('.', r'\.').replace('*', '.*').replace('?', '.'), p))
                if hit:
                    found.append(('高', '會擋到保護網域 %s：%s' % (p, s)))
    return found


def is_reject(path):
    return 'reject' in path.lower() or 'adblock' in path.lower() or 'httpdns' in path.lower()


def cmd_check(lock, args):
    protect = load_protect()
    out = ['# 完整檢查（%s）' % datetime.date.today().isoformat(), '']
    total_high = 0
    for name, src in lock['sources'].items():
        if not src.get('commit'):
            out.append('## %s：尚未固定提交，略過' % name)
            continue
        out.append('## %s　%s@%s' % (name, src['repo'], src['commit'][:12]))
        for path, want in src['files'].items():
            text = fetch(src['repo'], src['commit'], path)
            got = sha256(text)
            lines = entries(text)
            res = checks(path, lines, protect, is_reject(path))
            high = [r for r in res if r[0] == '高']
            total_high += len(high)
            flag = '' if got == want else '　**雜湊不符**'
            out.append('- `%s`：%d 條，高 %d、注意 %d%s' % (path, len(lines), len(high), len(res) - len(high), flag))
            for sev, msg in res[:40]:
                out.append('  - [%s] %s' % (sev, msg))
            if len(res) > 40:
                out.append('  - ……另有 %d 項' % (len(res) - 40))
        out.append('')
    out.append('高風險項目合計：%d' % total_high)
    emit(out, args.out)


def cmd_report(lock, args):
    protect = load_protect()
    out = ['# 上游差異報告（%s）' % datetime.date.today().isoformat(), '']
    changed_any = False
    for name, src in lock['sources'].items():
        if not src.get('commit') or not src.get('branch'):
            continue
        new = latest_sha(src['repo'], src['branch'])
        if new == src['commit']:
            out.append('## %s：沒有新提交' % name)
            continue
        out.append('## %s　%s → %s' % (name, src['commit'][:12], new[:12]))
        for path in src['files']:
            old_t = fetch(src['repo'], src['commit'], path)
            try:
                new_t = fetch(src['repo'], new, path)
            except Exception as e:
                out.append('- `%s`：**上游已刪除或無法取得**（%s）' % (path, e))
                changed_any = True
                continue
            if sha256(old_t) == sha256(new_t):
                continue
            changed_any = True
            a, b = set(entries(old_t)), set(entries(new_t))
            added, removed = sorted(b - a), sorted(a - b)
            res = checks(path, added, protect, is_reject(path))
            size_note = ''
            if a and abs(len(b) - len(a)) / len(a) > 0.2:
                size_note = '　**條數變動超過 20%%（%d → %d）**' % (len(a), len(b))
            out.append('- `%s`：新增 %d、刪除 %d%s' % (path, len(added), len(removed), size_note))
            for sev, msg in res[:30]:
                out.append('  - [%s] %s' % (sev, msg))
            out.append('  - 新增範例：' + '；'.join(added[:15]))
            if removed:
                out.append('  - 刪除範例：' + '；'.join(removed[:15]))
        out.append('')
        out.append('審核通過後：`python tools/audit.py bump %s %s --i-reviewed`' % (name, new))
        out.append('')
    if not changed_any:
        out.append('所有使用中的檔案都沒有變化。')
    emit(out, args.out)


def cmd_add_files(lock, args):
    text = open(args.template, encoding='utf-8').read()
    added = 0
    for name, path in PREFIX_RE.findall(text):
        path = urllib.parse.unquote(path)
        src = lock['sources'][name]
        if path in src['files']:
            continue
        if src.get('commit'):
            src['files'][path] = sha256(fetch(src['repo'], src['commit'], path))
        else:
            local = os.path.join(ROOT, path)
            src['files'][path] = sha256(open(local, encoding='utf-8').read()) if os.path.exists(local) else ''
        added += 1
        print('加入 %s/%s' % (name, path))
    save_lock(lock)
    print('共加入 %d 個檔案' % added)


def cmd_bump(lock, args):
    if not args.i_reviewed:
        sys.exit('請先看完 report 的差異並寫進 audits/，確認後加上 --i-reviewed')
    src = lock['sources'][args.source]
    for path in list(src['files']):
        src['files'][path] = sha256(fetch(src['repo'], args.sha, path))
    src['commit'] = args.sha
    src['audited'] = datetime.date.today().isoformat()
    save_lock(lock)
    print('%s 已換到 %s，%d 個檔案的雜湊已更新' % (args.source, args.sha[:12], len(src['files'])))


def emit(lines, out):
    text = '\n'.join(lines) + '\n'
    if out:
        with open(out, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        print('報告寫到 %s' % out)
    else:
        sys.stdout.write(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('check'); p.add_argument('--out')
    p = sub.add_parser('report'); p.add_argument('--out')
    p = sub.add_parser('add-files'); p.add_argument('template')
    p = sub.add_parser('bump'); p.add_argument('source'); p.add_argument('sha'); p.add_argument('--i-reviewed', action='store_true')
    args = ap.parse_args()
    lock = load_lock()
    {'check': cmd_check, 'report': cmd_report, 'add-files': cmd_add_files, 'bump': cmd_bump}[args.cmd](lock, args)


if __name__ == '__main__':
    main()
