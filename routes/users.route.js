const express = require("express");
const jwt = require("jsonwebtoken");
const { Users, UserInfos, UserHistories, sequelize } = require("../models");
const router = express.Router();
const {Transaction} = require("sequelize");
const authMiddleware = require("../middlewares/auth-middleware");

// 회원가입
router.post("/users", async (req, res) => {
  const { email, password, name, age, gender, profileImage } = req.body;
  const isExistUser = await Users.findOne({ where: { email } });

  if (isExistUser) {
    return res.status(409).json({ message: "이미 존재하는 이메일입니다." });
  }

  // MySQL과 연결된 sequelize connection에서 transaction을 생성합니다.
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED, // 트랜잭션 격리 수준을 설정합니다.
  });

  try {
    // Users 테이블에 사용자를 추가합니다.
    const user = await Users.create(
      { email, password },
      { transaction: t } // transaction을 사용합니다.
    );

    // UserInfos 테이블에 사용자 정보를 추가합니다.
    const userInfo = await UserInfos.create({
        UserId: user.userId, // 생성한 유저의 userId를 바탕으로 사용자 정보를 생성합니다.
        name,
        age,
        gender: gender.toUpperCase(), // 성별을 대문자로 변환합니다.
        profileImage
      },
      { transaction: t } // transaction을 사용합니다.
    );

    // 트랜잭션을 사용한 모든 로직을 Commit, DB에 반영합니다.
    await t.commit();
  } catch (transactionError) {
    // 에러가 발생하였다면, 트랜잭션을 사용한 모든 쿼리를 Rollback, DB에 반영하지 않습니다.
    console.error(transactionError);
    await t.rollback();
    return res.status(400).json({ errorMessage: `유저 생성에 실패하였습니다.` })
  }
  return res.status(201).json({ message: "회원가입이 완료되었습니다." });
});


// 로그인
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await Users.findOne({ where: { email } });
  if (!user) {
    return res.status(401).json({ message: "존재하지 않는 이메일입니다." });
  } else if (user.password !== password) {
    return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
  }

  const token = jwt.sign({
    userId: user.userId
  }, "customized-secret-key");
  res.cookie("authorization", `Bearer ${token}`);
  return res.status(200).json({ message: "로그인 성공" });
});


// 사용자 조회
router.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;

  const user = await Users.findOne({
    attributes: ["userId", "email", "createdAt", "updatedAt"],
    include: [
      {
        model: UserInfos,  // 1:1 관계를 맺고있는 UserInfos 테이블을 조회합니다.
        attributes: ["name", "age", "gender", "profileImage"],
      }
    ],
    where: { userId }
  });

  return res.status(200).json({ data: user });
});

// 사용자 이름 변경 API
router.put("/users/name", authMiddleware, async (req, res) => {
  const { userId } = res.locals.user;
  const { name } = req.body;

  const userInfo = await UserInfos.findOne({ where: { userId } });
  const beforeUserName = userInfo.name;

  // MySQL과 연결된 sequelize connection에서 transaction을 생성합니다.
  const t = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED, // 트랜잭션 격리 수준을 설정합니다.
  });
  try {
    await UserInfos.update(
      { name },
      {
        where: { userId },
        transaction: t, // transaction을 사용합니다.
      }
    );

    await UserHistories.create(
      {
        UserId: userId,
        beforeName: beforeUserName,
        afterName: name,
      },
      { transaction: t } // transaction을 사용합니다.
    );

    t.commit();
  } catch (transactionError) {
    console.error(transactionError);
    t.rollback();
    return res
      .status(400)
      .json({ errorMessage: `유저 이름 변경에 실패하였습니다.` });
  }

  return res.status(200).json({ message: "유저 이름 변경에 성공하였습니다." });
});
module.exports = router;