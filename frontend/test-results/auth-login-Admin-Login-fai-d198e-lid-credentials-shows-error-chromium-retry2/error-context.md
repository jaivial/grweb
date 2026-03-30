# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img [ref=e7]
    - heading "Admin Login" [level=1] [ref=e9]
    - paragraph [ref=e10]: GR Cup Raffle Management
  - generic [ref=e11]:
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: Username
        - generic [ref=e15]:
          - generic:
            - img
          - textbox "Username" [ref=e16]:
            - /placeholder: Enter your username
            - text: wrong@example.com
      - generic [ref=e17]:
        - generic [ref=e18]: Password
        - generic [ref=e19]:
          - generic:
            - img
          - textbox "Password" [ref=e20]:
            - /placeholder: Enter your password
            - text: wrongpassword
      - button "Sign In" [active] [ref=e21] [cursor=pointer]:
        - img [ref=e22]
        - text: Sign In
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e28]:
        - paragraph [ref=e29]: Credenciales
        - paragraph [ref=e30]: "Username: jaime@hotmail.com"
        - paragraph [ref=e31]: "Password: test123123"
  - button "Back to Home" [ref=e33] [cursor=pointer]:
    - img [ref=e34]
    - text: Back to Home
  - paragraph [ref=e37]: Protected by JWT authentication
```