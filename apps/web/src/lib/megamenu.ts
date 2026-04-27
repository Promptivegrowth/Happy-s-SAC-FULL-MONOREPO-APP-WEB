/**
 * Estructura del megamenú principal del header.
 * Cada grupo de navegación (DISFRACES DE NIÑO, NIÑA, ADULTOS) tiene columnas;
 * cada columna es una sub-categoría con un título (link a /categoria/[slug])
 * y una lista descriptiva de ejemplos de productos para SEO/orientación.
 *
 * Si en el futuro queremos que cada item sea link a producto específico,
 * basta cambiar `examples` por `links: { label, href }[]` y ajustar el render.
 */

export type MegaColumna = {
  titulo: string;
  href: string;
  icono: string; // emoji
  examples: string[];
};

export type MegaItem =
  | {
      kind: 'mega';
      label: string;
      href: string;
      hot?: boolean;
      columns: MegaColumna[];
    }
  | {
      kind: 'dropdown';
      label: string;
      href: string;
      hot?: boolean;
      links: { label: string; href: string }[];
    }
  | {
      kind: 'link';
      label: string;
      href: string;
      hot?: boolean;
    };

export const MEGA_MENU: MegaItem[] = [
  { kind: 'link', label: 'Home', href: '/' },

  {
    kind: 'mega',
    label: 'Disfraces de niño',
    href: '/disfraces/ninos',
    columns: [
      {
        titulo: 'Superhéroes económicos',
        href: '/categoria/superheroes?tier=economico&genero=NINO',
        icono: '🦸',
        examples: ['Spiderman', 'Ironman', 'Superman', 'Batman', 'Capitán América', 'Venom', 'Flash'],
      },
      {
        titulo: 'Superhéroes especiales',
        href: '/categoria/superheroes?tier=especial&genero=NINO',
        icono: '⭐',
        examples: ['Spiderman', 'Ironman', 'Superman', 'Sonic', 'Goku', 'Venom', 'Capitán América', 'Flash'],
      },
      {
        titulo: 'Profesiones',
        href: '/categoria/profesiones?genero=NINO',
        icono: '👷',
        examples: ['Bombero', 'Policía niño', 'Cruz roja', 'Enfermero', 'Comando con polo'],
      },
      {
        titulo: 'Danzas típicas',
        href: '/categoria/danzas-tipicas?genero=NINO',
        icono: '💃',
        examples: ['Festejo', 'Negroide', 'Chala', 'Carnaval arequipeño', 'Balicha', 'Shipibo', 'Huaylas'],
      },
      {
        titulo: 'Personajes',
        href: '/categoria/personajes-varios?genero=NINO',
        icono: '🎭',
        examples: ['Mario Bros', 'Luigi', 'Piloto', 'Cars', 'Pocoyo', 'Quico', 'Chavo', 'Chapulín'],
      },
      {
        titulo: 'Halloween',
        href: '/categoria/halloween?genero=NINO',
        icono: '🎃',
        examples: ['Chuky', 'Juego del calamar', 'Wasson', 'Mavis', 'Tifany', 'Harley Quinn', 'Maléfica', 'Huérfana', 'Merlina'],
      },
      {
        titulo: 'Primavera',
        href: '/categoria/primavera?genero=NINO',
        icono: '🌸',
        examples: ['Abejorro', 'Flores', 'Mariposa', 'Conejos', 'Hadas', 'Mariquitas'],
      },
    ],
  },

  {
    kind: 'mega',
    label: 'Disfraces niñas',
    href: '/disfraces/ninas',
    columns: [
      {
        titulo: 'Princesas Disney',
        href: '/categoria/princesas-especiales?genero=NINA',
        icono: '👸',
        examples: ['Blanca Nieves', 'Rapunzel', 'Frozen II', 'Jazmín', 'Sirenita', 'Bella', 'Aurora'],
      },
      {
        titulo: 'Personajes',
        href: '/categoria/personajes-varios?genero=NINA',
        icono: '🎭',
        examples: ['Pitufina', 'Minnie', 'Lulú', 'Dora exploradora', 'Lady Bug', 'Chilindrina'],
      },
      {
        titulo: 'Profesiones',
        href: '/categoria/profesiones?genero=NINA',
        icono: '👩‍⚕️',
        examples: ['Bombera', 'Policía niña', 'Doctora', 'Enfermera', 'Obstetra', 'Chef'],
      },
      {
        titulo: 'Halloween',
        href: '/categoria/halloween?genero=NINA',
        icono: '🎃',
        examples: ['Mavis', 'Tifany', 'Harley Quinn', 'Maléfica', 'Huérfana', 'Merlina'],
      },
      {
        titulo: 'Primavera',
        href: '/categoria/primavera?genero=NINA',
        icono: '🌸',
        examples: ['Mariposas body', 'Mariposas vestido', 'Flores', 'Girasoles', 'Abejitas', 'Mariquitas'],
      },
      {
        titulo: 'Danzas típicas',
        href: '/categoria/danzas-tipicas?genero=NINA',
        icono: '💃',
        examples: ['Festejo', 'Negroide', 'Chala', 'Carnaval arequipeño', 'Balicha', 'Shipibo', 'Huaylas'],
      },
    ],
  },

  {
    kind: 'mega',
    label: 'Disfraces de adultos',
    href: '/disfraces/adultos',
    columns: [
      {
        titulo: 'Superhéroes',
        href: '/categoria/superheroes?genero=ADULTO',
        icono: '🦸',
        examples: ['Spiderman', 'Superman', 'Capitán América', 'Batman', 'Hulk', 'Mujer Maravilla'],
      },
      {
        titulo: 'Halloween',
        href: '/categoria/halloween?genero=ADULTO',
        icono: '🎃',
        examples: ['Chuky', 'Juego del calamar', 'Wasson', 'Mavis', 'Tifany', 'Harley Quinn', 'Maléfica'],
      },
      {
        titulo: 'Navidad',
        href: '/categoria/navidad',
        icono: '🎅',
        examples: ['Mamá Noela', 'Papá Noel', 'Duendes', 'Renos', 'José', 'Jesús', 'María', 'Reyes Magos'],
      },
      {
        titulo: 'Show infantil',
        href: '/categoria/personajes-varios?tier=show&genero=ADULTO',
        icono: '🎪',
        examples: ['Animadoras', 'Bailarinas', 'Payasos'],
      },
      {
        titulo: 'Muñecos publicitarios',
        href: '/categoria/personajes-varios?tier=mascotas',
        icono: '🤖',
        examples: ['Mickey', 'Minnie', 'Minions', 'Pollito Chicken', 'Otros'],
      },
      {
        titulo: 'Danzas típicas',
        href: '/categoria/danzas-tipicas?genero=ADULTO',
        icono: '💃',
        examples: ['Festejo', 'Negroide', 'Chala', 'Carnaval arequipeño', 'Balicha', 'Shipibo', 'Huaylas'],
      },
    ],
  },

  {
    kind: 'dropdown',
    label: 'Accesorios',
    href: '/disfraces/accesorios',
    links: [
      { label: 'Coronas', href: '/disfraces/accesorios?tipo=coronas' },
      { label: 'Vinchas', href: '/disfraces/accesorios?tipo=vinchas' },
      { label: 'Pelucas', href: '/disfraces/accesorios?tipo=pelucas' },
      { label: 'Alitas', href: '/disfraces/accesorios?tipo=alitas' },
    ],
  },

  {
    kind: 'link',
    label: 'Día de la Madre 2026',
    href: '/campanias/dia-de-la-madre-2026',
    hot: true,
  },

  { kind: 'link', label: 'Contacto', href: '/contacto' },
];
