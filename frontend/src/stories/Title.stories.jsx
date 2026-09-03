import PageTitle from '../components/AppUser/Body/Generic/PageTitle';

export default {
  component: PageTitle,
  argTypes: {
    title: {
      description: 'Text del títol',
    },
    showAddIcon: {
      description: 'Mostra la icona de +',
    },
    openModal: {
      description: 'Obre un modal',
    },
    showSercher: {
      description: 'Mostra una barra de cerca',
    },
    placeholder: {
      description: 'Text per defecte que surt a la barra de cerca',
    },
  },
};

export const PageTitleBasic = {
  args: {
    title: 'El títol',
  },
};

export const PageTitleShowAddIcon = {
  args: {
    title: 'Show Add Button',
    showAddIcon: true,
    openModal: false,
  },
};

export const PageTitleShowSercher = {
  args: {
    title: 'Searcher',
    showSercher: true,
    placeholder: 'Escriu alguna cosa',
  },
};

export const PageTitleFullEquiped = {
  args: {
    title: 'FULL EQUIPED!',
    showAddIcon: true,
    openModal: false,
    showSercher: true,
    placeholder: 'Escriu alguna cosa',
  },
};
