describe('Login-logout-flow', () => {
  const email = 'admintcg@gmail.com';
  const pwd = '123456Ab';

  it('Login and Logout', () => {
    cy.visit('/auth');
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(pwd);
    cy.get('#login-button').click();
    cy.url().should('eq', Cypress.config().baseUrl);
    cy.get('#log-out-button').click();
    cy.url().should('eq', Cypress.config().baseUrl + 'auth');
  });
});
