#!/usr/bin/env python3
"""
Corpus sintético bilingüe ES/EN para clasificador experimental de riesgo de grooming.

- Solo texto sintético. Sin conversaciones privadas ni material sexual de menores.
- Patrones lingüísticos de manipulación progresiva (secreto, aislamiento, canal privado,
  sondeo de edad/contexto en tono inapropiado, escalada), NO una sola palabra aislada.
- Casos benignos difíciles: familia, profesores, amigos, deportes, salud (sin riesgo).
- Licencia del corpus: CC0 (obra original de KERNEL para pruebas). No incluye PAN12.

Etiquetas: grooming_risk | benign
Idiomas: es | en | mixed
"""
from __future__ import annotations

import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent
RNG = random.Random(42)

# Roles genéricos; no se identifican menores reales.
A, B = "SpeakerA", "SpeakerB"


def turns(*lines: str) -> str:
    return "\n".join(lines)


# --- Benign ES ---
BENIGN_ES = [
    turns(
        f"{A}: ¿Vienes al entrenamiento de mañana?",
        f"{B}: Sí, a las seis en el polideportivo.",
        f"{A}: Perfecto, avisa a tu madre que te paso a buscar.",
    ),
    turns(
        f"{A}: Profe, ¿puedo entregar el trabajo el viernes?",
        f"{B}: Sí, hasta las 15:00 en la plataforma del instituto.",
        f"{A}: Gracias, lo subo con la bibliografía.",
    ),
    turns(
        f"{A}: Abuela, ¿vienes a comer el domingo?",
        f"{B}: Claro, llevo la tortilla.",
        f"{A}: Genial, te esperamos.",
    ),
    turns(
        f"{A}: El médico dijo que la fiebre es viral, reposo y agua.",
        f"{B}: Vale, compro el paracetamol que indicó.",
        f"{A}: Y avisa si sube de 39.",
    ),
    turns(
        f"{A}: ¿Quedamos para estudiar matemáticas?",
        f"{B}: Sí, en la biblioteca municipal a las 17.",
        f"{A}: Llevo los apuntes del tema 4.",
    ),
    turns(
        f"{A}: Feliz cumpleaños, te dejé el regalo en casa de tu hermana.",
        f"{B}: ¡Gracias! Luego te llamo.",
    ),
    turns(
        f"{A}: El tren sale a las 9, no llegues tarde.",
        f"{B}: Ya estoy en el andén 3.",
    ),
    turns(
        f"{A}: ¿Cómo te fue el examen de historia?",
        f"{B}: Bien, salieron las fechas que repasamos.",
        f"{A}: Qué bien, nos vemos en clase.",
    ),
]

# --- Benign EN ---
BENIGN_EN = [
    turns(
        f"{A}: Are you coming to practice tomorrow?",
        f"{B}: Yes, six at the community center.",
        f"{A}: Cool, tell your mom I'll pick you up.",
    ),
    turns(
        f"{A}: Can I submit the essay on Friday?",
        f"{B}: Yes, by 3pm on the school platform.",
        f"{A}: Thanks, I'll include the bibliography.",
    ),
    turns(
        f"{A}: Grandma, are you coming for lunch on Sunday?",
        f"{B}: Sure, I'll bring pie.",
        f"{A}: Great, see you then.",
    ),
    turns(
        f"{A}: Doctor said it's viral, rest and fluids.",
        f"{B}: OK, I'll get the medicine they recommended.",
    ),
    turns(
        f"{A}: Study session at the library at 5?",
        f"{B}: Yes, bringing chapter 4 notes.",
    ),
    turns(
        f"{A}: Happy birthday! Left your gift at your sister's.",
        f"{B}: Thank you! I'll call later.",
    ),
    turns(
        f"{A}: Train leaves at 9, don't be late.",
        f"{B}: Already on platform 3.",
    ),
    turns(
        f"{A}: How was the history test?",
        f"{B}: Fine, the dates we reviewed came up.",
    ),
]

# --- Benign mixed ---
BENIGN_MIXED = [
    turns(
        f"{A}: ¿Vienes al match de mañana?",
        f"{B}: Yes, same field as last week.",
        f"{A}: Perfecto, nos vemos allí.",
    ),
    turns(
        f"{A}: Homework is due Friday, ¿ok?",
        f"{B}: Sí, lo subo al classroom.",
    ),
]

# --- Risk ES: patrones progresivos (sin contenido sexual explícito) ---
RISK_ES = [
    turns(
        f"{A}: Hola, qué maduro se te ve para la edad que tienes.",
        f"{B}: ¿Ah sí?",
        f"{A}: Sí, no como otros. Mejor no le digas a nadie que hablamos tanto, ¿vale? Es nuestro secreto.",
        f"{B}: Por qué secreto?",
        f"{A}: Porque la gente no entiende. Mejor escribimos por otra app donde nadie controla.",
    ),
    turns(
        f"{A}: Cuántos años tienes exactamente, y estás solo en casa por las tardes?",
        f"{B}: A veces.",
        f"{A}: Tus padres no tienen por qué enterarse de nuestras charlas. Si les dices, me enfadaré contigo.",
        f"{B}: No sé...",
        f"{A}: Confía en mí más que en ellos. Pasa a Telegram, aquí nos leen.",
    ),
    turns(
        f"{A}: Eres especial. Nadie te entiende como yo.",
        f"{B}: Gracias...",
        f"{A}: Si de verdad me quieres, no cuentes esto en casa. Y mándame una foto tuya solo para mí.",
        f"{B}: No estoy seguro.",
        f"{A}: Si no lo haces, igual le enseño a tus amigos lo que me contaste antes.",
    ),
    turns(
        f"{A}: Olvídate un poco de tus amigos, solo nos necesitamos tú y yo.",
        f"{B}: Pero quedo con ellos el finde.",
        f"{A}: Ellos no te aprecian. Borra el grupo y háblame solo a mí por la noche cuando nadie mire.",
    ),
    turns(
        f"{A}: ¿En qué colegio estás y a qué hora sales?",
        f"{B}: Por qué lo preguntas?",
        f"{A}: Para conocernos mejor. No se lo digas a tu madre, se pondría rara. Mejor nos vemos sin que lo sepa.",
    ),
    turns(
        f"{A}: Si me haces caso te compro cosas, pero solo si no se lo cuentas a nadie.",
        f"{B}: Qué cosas?",
        f"{A}: Da igual, lo importante es que confíes en mí y no en tus padres. Pásate a otra red ahora.",
    ),
]

# --- Risk EN ---
RISK_EN = [
    turns(
        f"{A}: You seem so mature for your age.",
        f"{B}: Do I?",
        f"{A}: Yeah. Don't tell anyone we talk this much, ok? It's our secret.",
        f"{B}: Why secret?",
        f"{A}: People wouldn't get it. Let's move to an app where nobody checks messages.",
    ),
    turns(
        f"{A}: How old are you exactly, and are you home alone after school?",
        f"{B}: Sometimes.",
        f"{A}: Your parents don't need to know about our chats. If you tell them I'll be upset with you.",
        f"{B}: I don't know...",
        f"{A}: Trust me more than them. Switch to Telegram, people read stuff here.",
    ),
    turns(
        f"{A}: You're special. Nobody understands you like I do.",
        f"{B}: Thanks...",
        f"{A}: If you really care, don't tell anyone at home. Send me a private photo just for me.",
        f"{B}: Not sure.",
        f"{A}: If you don't, I might show your friends what you told me earlier.",
    ),
    turns(
        f"{A}: Forget your friends a bit, we only need each other.",
        f"{B}: I'm hanging out with them this weekend.",
        f"{A}: They don't value you. Leave the group and message me at night when nobody is watching.",
    ),
    turns(
        f"{A}: Which school and what time do you finish?",
        f"{B}: Why?",
        f"{A}: To know you better. Don't tell your mom, she'd act weird. We should meet without her knowing.",
    ),
    turns(
        f"{A}: I'll buy you stuff if you listen, but only if you tell no one.",
        f"{B}: What stuff?",
        f"{A}: Doesn't matter. Trust me, not your parents. Move to another app now.",
    ),
]

# --- Risk mixed ---
RISK_MIXED = [
    turns(
        f"{A}: You seem really mature. Mejor no le digas a nadie que hablamos.",
        f"{B}: Why?",
        f"{A}: Because it's our secreto. Move to Snapchat, aquí nos controlan.",
    ),
    turns(
        f"{A}: How old are you? Estás solo en casa?",
        f"{B}: Sometimes.",
        f"{A}: Don't tell your parents. Confía en mí and switch apps.",
    ),
]



# --- Hard negatives: secrets, age questions and platform changes in benign contexts ---
HARD_BENIGN_ES = [
    turns(f"{A}: No le cuentes a nadie lo de la fiesta sorpresa de mamá.", f"{B}: Tranquilo, ya compré las velas.", f"{A}: Se lo diremos después de la tarta."),
    turns(f"{A}: ¿Cuántos años tienes? Es para apuntarte a la categoría sub-16 del torneo.", f"{B}: Quince.", f"{A}: Perfecto, la inscripción la hace tu tutor."),
    turns(f"{A}: Pasa al Telegram oficial del club; ahí publican los horarios.", f"{B}: Vale, es el grupo donde está el entrenador."),
    turns(f"{A}: Borra el mensaje duplicado del grupo de clase, que ya está corregido.", f"{B}: Hecho, dejo el aviso fijado."),
    turns(f"{A}: Si no puedes venir al entrenamiento, avisa a tus padres y al entrenador.", f"{B}: Ya están informados."),
    turns(f"{A}: Te regalo el libro por tu cumpleaños, sin condiciones.", f"{B}: Gracias, lo quería desde hace tiempo."),
]
HARD_BENIGN_EN = [
    turns(f"{A}: Keep the birthday present a secret until Sunday.", f"{B}: Sure, the family will be surprised.", f"{A}: We'll tell everyone after lunch."),
    turns(f"{A}: How old are you? I need the age group for the public tournament registration.", f"{B}: Fifteen.", f"{A}: Ask your parent to complete the form."),
    turns(f"{A}: Move to the official club Telegram group for practice updates.", f"{B}: I'm already in the group with the coach."),
    turns(f"{A}: Delete the duplicate message from the class chat; the corrected timetable is pinned.", f"{B}: Done."),
    turns(f"{A}: Don't keep this medical detail secret from your doctor; tell your parent too.", f"{B}: I will."),
    turns(f"{A}: I bought you a book as a birthday gift, no strings attached.", f"{B}: Thank you."),
]
HARD_BENIGN_MIXED = [
    turns(f"{A}: Keep the sorpresa del cumpleaños secret until Sunday.", f"{B}: Vale, se lo diremos después de la fiesta."),
    turns(f"{A}: Join the grupo oficial del club for horarios.", f"{B}: Ya estoy, el entrenador publica allí."),
    turns(f"{A}: ¿Cuántos años tienes? It's for the under-16 tournament category.", f"{B}: Fifteen.", f"{A}: Ask your parent to sign the form."),
    turns(f"{A}: Borra el mensaje duplicado del class group.", f"{B}: Done, el horario correcto está fijado."),
]

# --- Hard positives: multi-turn combinations; no explicit sexual content ---
HARD_RISK_ES = [
    turns(f"{A}: Eres la única persona que me entiende.", f"{B}: No sé qué decir.", f"{A}: No se lo cuentes a tus padres; es nuestro secreto.", f"{B}: Me incomoda.", f"{A}: Pasa a otra app y borra este chat."),
    turns(f"{A}: ¿Estás solo en casa esta tarde?", f"{B}: Sí, un rato.", f"{A}: No confíes en tus amigos, no te entienden.", f"{B}: Prefiero no hablar de eso.", f"{A}: Si lo cuentas, enseñaré tus mensajes."),
    turns(f"{A}: Te compro lo que quieras si haces lo que te pido.", f"{B}: No quiero.", f"{A}: Si no aceptas, me decepcionarás y habrá consecuencias."),
    turns(f"{A}: Mándame una foto privada solo para mí.", f"{B}: No quiero enviar fotos.", f"{A}: Quedamos a escondidas y no se lo dices a nadie."),
    turns(f"{A}: ¿En qué colegio estudias y cuándo salen tus padres?", f"{B}: ¿Para qué?", f"{A}: No se lo cuentes a nadie; nos vemos sin que tu familia lo sepa."),
    turns(f"{A}: You are special, nobody understands you like I do.", f"{B}: That's a lot to say.", f"{A}: Keep our chats secret and delete the messages.", f"{B}: I don't want to.", f"{A}: If you tell anyone, I'll show everyone your private messages."),
]
HARD_RISK_EN = [
    turns(f"{A}: Nobody understands you like I do.", f"{B}: My friends do.", f"{A}: Stay away from them and don't tell your parents about us.", f"{B}: That feels wrong.", f"{A}: Move to a private app and delete this chat."),
    turns(f"{A}: Are you home alone after school?", f"{B}: Sometimes.", f"{A}: Keep it secret from your family.", f"{B}: Why?", f"{A}: We can meet without telling your parents."),
    turns(f"{A}: I'll buy you gifts if you listen to me.", f"{B}: I don't want gifts.", f"{A}: If you refuse, I'll expose your messages."),
    turns(f"{A}: Send me a private photo just for me.", f"{B}: No.", f"{A}: If you care about me, you'll do it; otherwise you'll regret it."),
    turns(f"{A}: Which school do you attend and when are your parents away?", f"{B}: Why do you need to know?", f"{A}: Don't tell anyone; let's meet secretly."),
    turns(f"{A}: Switch to another app so nobody can read our messages.", f"{B}: I'd rather stay here.", f"{A}: Delete this conversation and don't tell your family."),
]
HARD_RISK_MIXED = [
    turns(f"{A}: You are especial para mí.", f"{B}: ¿Por qué?", f"{A}: Don't tell your padres; it's our secret.", f"{B}: No me gusta.", f"{A}: Delete this chat and pasa a otra app."),
    turns(f"{A}: ¿Estás solo en casa?", f"{B}: Sometimes.", f"{A}: No confíes en tus amigos; move to a private app."),
    turns(f"{A}: I'll buy you regalos if you keep this secret.", f"{B}: No quiero.", f"{A}: If you tell anyone, I'll expose you."),
    turns(f"{A}: Send a private photo, solo para mí.", f"{B}: No.", f"{A}: Meet me secretly sin que tus padres lo sepan."),
]


def pack(examples: list[str], label: str, lang: str, difficulty: str = "core") -> list[dict]:
    rows = []
    for i, text in enumerate(examples):
        rows.append(
            {
                "id": f"{label}-{lang}-{i}" if difficulty == "core" else f"{label}-{lang}-{difficulty}-{i}",
                "label": label,
                "language": lang,
                "text": text,
                "source": "kernel-synthetic-v2",
                "difficulty": difficulty,
                "license": "CC0-1.0",
            }
        )
    return rows


def main() -> None:
    rows: list[dict] = []
    rows += pack(BENIGN_ES, "benign", "es")
    rows += pack(BENIGN_EN, "benign", "en")
    rows += pack(BENIGN_MIXED, "benign", "mixed")
    rows += pack(RISK_ES, "grooming_risk", "es")
    rows += pack(RISK_EN, "grooming_risk", "en")
    rows += pack(RISK_MIXED, "grooming_risk", "mixed")
    rows += pack(HARD_BENIGN_ES, "benign", "es", "hard_negative")
    rows += pack(HARD_BENIGN_EN, "benign", "en", "hard_negative")
    rows += pack(HARD_BENIGN_MIXED, "benign", "mixed", "hard_negative")
    rows += pack(HARD_RISK_ES, "grooming_risk", "es", "hard_positive")
    rows += pack(HARD_RISK_EN, "grooming_risk", "en", "hard_positive")
    rows += pack(HARD_RISK_MIXED, "grooming_risk", "mixed", "hard_positive")

    # Paráfrasis siempre pertenecen al mismo grupo canónico que el original.
    extra: list[dict] = []
    for r in list(rows):
        if r["label"] == "benign" and "biblioteca" in r["text"]:
            extra.append(
                {
                    **r,
                    "id": r["id"] + "-var",
                    "text": r["text"].replace("biblioteca", "sala de estudio"),
                }
            )
        if r["label"] == "grooming_risk" and "Telegram" in r["text"]:
            extra.append(
                {
                    **r,
                    "id": r["id"] + "-var",
                    "text": r["text"].replace("Telegram", "Signal"),
                }
            )
    rows.extend(extra)
    # Group at the conversation-root level so variants can never cross splits.
    grouped: dict[tuple[str, str], dict[str, list[dict]]] = {}
    for row in rows:
        root_id = row["id"].removesuffix("-var")
        key = (row["label"], row["language"])
        grouped.setdefault(key, {}).setdefault(root_id, []).append(row)

    train, val, test = [], [], []
    for key in sorted(grouped):
        groups = list(grouped[key].items())
        RNG.shuffle(groups)
        count = len(groups)
        # Small strata stay in training rather than creating empty training sets.
        if count < 3:
            train.extend(row for _group_id, group_rows in groups for row in group_rows)
            continue
        n_test = max(1, round(count * 0.15))
        n_val = max(1, round(count * 0.15))
        if n_test + n_val >= count:
            n_test, n_val = 1, 1
        test_groups = groups[:n_test]
        val_groups = groups[n_test:n_test + n_val]
        train_groups = groups[n_test + n_val:]
        test.extend(row for _group_id, group_rows in test_groups for row in group_rows)
        val.extend(row for _group_id, group_rows in val_groups for row in group_rows)
        train.extend(row for _group_id, group_rows in train_groups for row in group_rows)

    RNG.shuffle(train)
    RNG.shuffle(val)
    RNG.shuffle(test)

    def write(name: str, data: list[dict]) -> None:
        path = OUT / name
        path.write_text(
            "\n".join(json.dumps(x, ensure_ascii=False) for x in data) + "\n",
            encoding="utf-8",
        )
        print(name, len(data))

    write("train.jsonl", train)
    write("val.jsonl", val)
    write("test.jsonl", test)
    meta = {
        "name": "kernel-grooming-synthetic-v2",
        "license": "CC0-1.0",
        "notes": [
            "Synthetic only. No private chats. No sexual content involving minors.",
            "Includes hard negatives and hard positives; synthetic examples do not represent prevalence.",
            "Group split by canonical conversation ID; paraphrase variants cannot cross train/val/test.",
            "Not a substitute for validation on real moderated conversations.",
            "Does not include PAN12 or other restricted datasets.",
            "Labels are for experimental safety tooling, not legal findings.",
        ],
        "labels": ["benign", "grooming_risk"],
        "languages": ["es", "en", "mixed"],
        "counts": {
            "train": len(train),
            "val": len(val),
            "test": len(test),
            "total": len(rows),
            "ambiguous_challenge": sum(1 for line in (OUT / "challenge_ambiguous.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()) if (OUT / "challenge_ambiguous.jsonl").exists() else 0,
        },
        "difficulty_counts": {
            "core": sum(1 for r in rows if r.get("difficulty") == "core"),
            "hard_negative": sum(1 for r in rows if r.get("difficulty") == "hard_negative"),
            "hard_positive": sum(1 for r in rows if r.get("difficulty") == "hard_positive"),
        },
    }
    (OUT / "DATASET.md").write_text(
        "# Dataset sintético grooming ES/EN\n\n"
        + json.dumps(meta, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(meta["counts"]))


if __name__ == "__main__":
    main()
