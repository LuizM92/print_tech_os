# Padrão de SKU — produtos 3D (Shopee)

SKU **centralizado**: o mesmo produto tem o mesmo SKU em todas as lojas.
Sem sufixo de loja — a loja é dimensão de canal, não de produto.

## Formato

```
SKU pai       CAT-MODELO
SKU variação  CAT-MODELO-MAT-VAR-TAM
```

Sempre 5 blocos, para poder quebrar por posição.

| Bloco | O que é |
|---|---|
| `CAT` | Categoria do produto. Tabela fechada abaixo. |
| `MODELO` | Nome curto do produto, 3–12 caracteres, sem acento nem espaço. |
| `MAT` | Material: `PLA`, `PET` (PETG), `TPU`, `ABS`. |
| `VAR` | Eixo primário de variação: **cor** quando existe; senão o design, personagem ou versão. `STD` quando o produto não varia nesse eixo. |
| `TAM` | Eixo secundário: **tamanho** (`P`/`M`/`G`), **quantidade do kit** (`02`, `04`, `20`), ou medida em cm (`08`, `16`). `U` quando não varia. |

O catálogo mostrou que boa parte dos produtos não varia por cor, e sim por
desenho (cortadores `V1`–`V8`) ou personagem (`FRA`, `PER`, `PAT`). Por isso o
bloco `VAR` é *variante*, não *cor* — cor é só o caso mais comum dele.

## Categorias

| Código | Tipo |
|---|---|
| `BON` | Boneco / figure action / colecionável |
| `COR` | Cortador e marcador de biscoito |
| `VAS` | Vaso / cachepô / vasinho |
| `DEC` | Decoração e enfeite (natal, halloween, religioso) |
| `ORG` | Organizador (passa-fio, nicho, escorredor) |
| `SUP` | Suporte / dock |
| `CHV` | Chaveiro |
| `BRQ` | Brinquedo / jogo |
| `IMP` | Impressora 3D e acessórios |
| `ELE` | Elétrica |
| `AUT` | Automotivo / moto |
| `FER` | Ferramenta |
| `PEC` | Peça técnica / funcional |

## Cores

| | | | |
|---|---|---|---|
| `PRT` preto | `BRC` branco | `CNZ` cinza | `CNE` cinza escuro |
| `CNC` cinza claro | `VRM` vermelho | `VNE` vermelho neon | `ESC` vermelho escarlete |
| `AZL` azul | `AZC` azul claro | `AZT` azul transformado | `VRD` verde |
| `VDE` verde escuro | `TIF` verde tiffany | `AMR` amarelo | `LRJ` laranja |
| `RSA` rosa bebê | `ROX` roxo | `MRR` marrom | `BEG` bege |
| `DRD` dourado | `MIS` misteriosa (surpresa) | | |

## Regras

- Maiúsculas, separador `-`, só A–Z e 0–9. Sem acento, `Ç` ou espaço.
- Sempre os 5 blocos, mesmo quando dois são `STD` e `U`.
- Quantidade no bloco `TAM` sempre com 2 dígitos: `02`, `04`, `20`.
- SKU nunca é reaproveitado. Produto descontinuado mantém o SKU aposentado.
- Produto igual em duas lojas = **um** SKU. Se uma loja tem uma cor a mais,
  ela ganha a variação — não um SKU novo.
- Duas listagens da mesma família compartilham o `SKU pai` e se separam no
  bloco `TAM`. Ex.: `VAS-PACMAN-PLA-AZL-G` (vaso) e `VAS-PACMAN-PLA-AZL-P` (vasinho
  suculenta) — mesmo pai `VAS-PACMAN`. Idem `BON-LOONEY` (normal `G` / mini
  `P`) e `SUP-CAPACETE` (avulso `U` / kit 2un `02`).

## Material

Hoje o catálogo inteiro está marcado como `PLA`. Alguns itens são PETG e
serão corrigidos item a item — a troca é só no bloco `MAT`, o resto do SKU
não muda:

```
SUP-CAPACETE-PLA-CPB-U  →  SUP-CAPACETE-PET-CPB-U
```

O `SKU pai` não carrega material, então um mesmo produto pode ter variações
em PLA e em PETG sob o mesmo pai.
