import { data } from '@waymark/rules';

/**
 * Ideas for names and backgrounds, by kind of world. They only fill the
 * suggestions in the builder: nothing else about a character depends on
 * them, and a player can always type their own. The first three come from
 * the rulebook's tables; the rest are extra ideas kept here.
 */
export interface Ideas {
  name: string;
  names: readonly string[];
  backgrounds: readonly string[];
}

export const IDEAS: Record<string, Ideas> = {
  fantasy: { name: 'Fantasy', names: data.names.fantasy, backgrounds: data.backgrounds.fantasy },
  modern: { name: 'Modern day', names: data.names.modern, backgrounds: data.backgrounds.modern },
  scifi: { name: 'Science fiction', names: data.names.scifi, backgrounds: data.backgrounds.scifi },
  postapocalypse: {
    name: 'After the end of the world',
    names: ['Ash', 'Juno', 'Rook', 'Sable', 'Tink', 'Wick'],
    backgrounds: [
      'Scavenger',
      'Caravan guard',
      'Water trader',
      'Tinkerer',
      'Vault dweller',
      'Courier',
      'Farmer',
      'Medic',
      'Raider who walked away',
      'Radio operator',
      'Mechanic',
      'Storyteller',
    ],
  },
  western: {
    name: 'Western',
    names: ['Abel', 'Clem', 'Dusty', 'Esther', 'Josie', 'Wyatt'],
    backgrounds: [
      'Ranch hand',
      'Stagecoach driver',
      'Prospector',
      'Telegraph clerk',
      'Deputy',
      'Card dealer',
      'Homesteader',
      'Trail cook',
      'Bounty hunter',
      'Railway surveyor',
      'Travelling doctor',
      'Blacksmith',
    ],
  },
  horror: {
    name: 'Horror and mystery',
    names: ['Agnes', 'Edmund', 'Harriet', 'Silas', 'Vera', 'Walter'],
    backgrounds: [
      'Librarian',
      'Night watchman',
      'Reporter',
      'Country doctor',
      'Antiques dealer',
      'Gravedigger',
      'Schoolteacher',
      'Private detective',
      'Photographer',
      'Parish clerk',
      'Lighthouse keeper',
      'Student of folklore',
    ],
  },
  pirates: {
    name: 'Pirates and the high seas',
    names: ['Anne', 'Barnaby', 'Calico', 'Finn', 'Marisol', 'Tobias'],
    backgrounds: [
      'Deckhand',
      'Ship’s cook',
      'Navigator',
      'Smuggler',
      'Harbour pilot',
      'Carpenter’s mate',
      'Powder monkey',
      'Fisher',
      'Runaway midshipman',
      'Pearl diver',
      'Sailmaker',
      'Dockside trader',
    ],
  },
  superhero: {
    name: 'Superheroes',
    names: ['Blaze', 'Echo', 'Jett', 'Nova', 'Quill', 'Vesper'],
    backgrounds: [
      'Paramedic',
      'Lab assistant',
      'Bike courier',
      'Student',
      'Firefighter',
      'Journalist',
      'Stunt performer',
      'Engineer',
      'Street artist',
      'Night-shift nurse',
      'Retired athlete',
      'Museum guard',
    ],
  },
  steampunk: {
    name: 'Steam and clockwork',
    names: ['Ada', 'Barnabus', 'Cog', 'Isambard', 'Pru', 'Tesla'],
    backgrounds: [
      'Boiler stoker',
      'Clockmaker',
      'Airship rigger',
      'Chimney sweep',
      'Inventor’s apprentice',
      'Mudlark',
      'Telegraph runner',
      'Factory hand',
      'Lamplighter',
      'Engine driver',
      'Cartographer',
      'Tinker',
    ],
  },
  mythic: {
    name: 'Myths and legends',
    names: ['Atalanta', 'Bran', 'Idun', 'Kiri', 'Oisin', 'Tala'],
    backgrounds: [
      'Shepherd',
      'Oracle’s attendant',
      'Charioteer',
      'Bard',
      'Fisher',
      'Temple guard',
      'Weaver',
      'Messenger',
      'Bronze smith',
      'Beekeeper',
      'Exile',
      'Hunter',
    ],
  },
};

export const ideasFor = (genre: string): Ideas => IDEAS[genre] ?? IDEAS.fantasy!;
