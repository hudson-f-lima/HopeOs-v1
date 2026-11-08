#!/usr/bin/env python3
"""Servidor estático da PWA para E2E, com os MESMOS headers do Render.

Lê o bloco `headers:` do serviço `hopeos-v1-frontend` em render.yaml (sem
PyYAML: parser mínimo para o formato `- path / name / value` usado ali) e
injeta cada header nas respostas cujo caminho casa com `path` (glob do Render:
`/*` = tudo). Também reproduz a rota `rewrite /* -> /index.html` para caminhos
que não existem em disco.

Única diferença proposital: `--connect-extra ORIGEM` acrescenta a API local
(dev-memory-api) ao `connect-src` da CSP, porque em produção a CSP só libera
https://hopeos-v1.onrender.com.

Uso (na raiz do repo):
  python3 -I backend/tests/e2e/static-server.py --port 5599 --connect-extra http://127.0.0.1:3399
"""
import argparse
import fnmatch
import http.server
import os
import re
import sys


def ler_headers(render_yaml, servico):
    """Devolve [(path, name, value)] do bloco headers do serviço."""
    linhas = open(render_yaml, encoding='utf-8').read().splitlines()
    dentro_servico = dentro_headers = False
    itens, atual = [], None
    for linha in linhas:
        sem_coment = linha.split(' #')[0] if not linha.lstrip().startswith('#') else ''
        if not sem_coment.strip():
            continue
        m = re.match(r'^\s*-?\s*name:\s*(.+)$', sem_coment)
        if re.match(r'^  - type:', sem_coment):
            dentro_servico = dentro_headers = False
        if m and re.match(r'^    name:', sem_coment):
            dentro_servico = m.group(1).strip() == servico
            continue
        if not dentro_servico:
            continue
        if re.match(r'^    headers:\s*$', sem_coment):
            dentro_headers = True
            continue
        if re.match(r'^    \S', sem_coment):  # outra chave do serviço (routes:, etc.)
            dentro_headers = False
            continue
        if not dentro_headers:
            continue
        kv = re.match(r'^\s*(-\s*)?(path|name|value):\s*(.*)$', sem_coment)
        if not kv:
            continue
        chave, valor = kv.group(2), kv.group(3).strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in '"\'':
            valor = valor[1:-1]
        if kv.group(1):
            atual = {}
            itens.append(atual)
        atual[chave] = valor
    return [(i['path'], i['name'], i['value']) for i in itens]


def com_connect_extra(csp, extra):
    if not extra:
        return csp
    partes = [p.strip() for p in csp.split(';')]
    for i, p in enumerate(partes):
        if p.startswith('connect-src '):
            partes[i] = p + ' ' + ' '.join(extra)
    return '; '.join(partes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=5599)
    ap.add_argument('--bind', default='127.0.0.1')
    ap.add_argument('--root', default='.')
    ap.add_argument('--render', default='render.yaml')
    ap.add_argument('--service', default='hopeos-v1-frontend')
    ap.add_argument('--connect-extra', action='append', default=[])
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    regras = ler_headers(os.path.join(root, args.render) if not os.path.isabs(args.render) else args.render, args.service)
    if not any(n.lower() == 'content-security-policy' for _, n, _ in regras):
        sys.exit('render.yaml sem Content-Security-Policy para ' + args.service)
    regras = [(p, n, com_connect_extra(v, args.connect_extra) if n.lower() == 'content-security-policy' else v) for p, n, v in regras]

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=root, **kw)

        def send_head(self):
            caminho = self.path.split('?', 1)[0].split('#', 1)[0]
            local = self.translate_path(caminho)
            if caminho != '/' and not os.path.exists(local):
                self.path = '/index.html'  # rewrite /* -> /index.html do Render
            return super().send_head()

        def end_headers(self):
            caminho = self.path.split('?', 1)[0]
            for padrao, nome, valor in regras:
                if fnmatch.fnmatchcase(caminho, padrao):
                    self.send_header(nome, valor)
            super().end_headers()

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer((args.bind, args.port), Handler)
    print(f'static-server em http://{args.bind}:{args.port} com {len(regras)} headers de {args.render}', flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
