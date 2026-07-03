# Patch do frontend HTML para API Node

O arquivo `index.local-prototype.html` é o V9.2.4 local preservado.

## Próxima etapa

Não reescrever o front do zero.

Aplicar patch cirúrgico:

```txt
1. Incluir <script src="api-client.js"></script>
2. Trocar load(KEYS.*) por HopeApi.snapshot() onde fizer sentido
3. Trocar checkout local por HopeApi.checkoutPreview() e HopeApi.checkoutClose()
4. Dashboard e financeiro passam a ler /api/dashboard e /api/financeiro/resumo
5. localStorage fica apenas como cache/configuração visual, não como banco
```

## Regra canônica

```txt
Frontend não calcula taxa, comissão, gorjeta ou líquido salão.
Frontend solicita preview ao backend.
Frontend fecha comanda pelo backend.
```
